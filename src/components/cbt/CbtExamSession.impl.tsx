import { Link, useParams, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, ChevronLeft, ChevronRight, Loader2, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SchoolLogo } from "@/components/brand/SchoolLogo";
import { useSchoolIdentity } from "@/lib/school-identity";
import { ExamSecurityGate } from "@/components/cbt/ExamSecurityGate";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useStudentContext, formatExamWindow } from "@/lib/student";
import { useSessionUser } from "@/lib/session";
import { friendlyError } from "@/lib/friendly-error";
import { fromExamSettingsRow, type ExamSettingsRow } from "@/lib/exam-security";
import { parseExamMeta, pickExamQuestions, seededShuffle } from "@/lib/exam-meta";
import { type DeviceCapabilities } from "@/lib/device-capabilities";
import { toast } from "sonner";
import { ExamCameraPip, type FaceSecurityEvent } from "@/components/cbt/ExamCameraPip";
import { saveCbtResult } from "@/lib/cbt-save-result";
import { logSecurityEvent } from "@/lib/cbt-security";
import { mapFaceSecurityEvent } from "@/lib/live-monitor";
import { startLiveCamPublisher, type LiveCamPublisher } from "@/lib/live-video";

function isPreviewPath() {
  if (typeof window === "undefined") return false;
  return window.location.pathname.includes("/officer/exam-preview");
}
function decodeOptions(explanation: string | null): string[] {
  if (!explanation) return [];
  const optLine = explanation.split("\n").find((l) => l.startsWith("OPTIONS::"));
  if (!optLine) return [];
  const body = optLine.slice("OPTIONS::".length);
  const map: Record<string, string> = {};
  for (const part of body.split("|")) {
    const eq = part.indexOf("=");
    if (eq > 0) map[part.slice(0, eq).trim().toUpperCase()] = part.slice(eq + 1);
  }
  return ["A", "B", "C", "D"].map((k) => map[k]).filter(Boolean) as string[];
}

function stopMediaStream(stream: MediaStream | null | undefined) {
  if (!stream) return;
  try {
    for (const t of stream.getTracks()) {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

async function requestExamFullscreen(): Promise<boolean> {
  if (typeof document === "undefined") return false;
  if (document.fullscreenElement) return true;
  const el = document.documentElement;
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen();
      return Boolean(document.fullscreenElement);
    }
  } catch {
    /* browser blocked without user gesture */
  }
  return Boolean(document.fullscreenElement);
}

export function CbtExamPage() {
  const params = useParams({ strict: false }) as { id?: string };
  const id = params.id ?? "";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const previewMode = isPreviewPath();
  const { data: student } = useStudentContext();
  const { data: session } = useSessionUser();
  const { data: schoolBrand } = useSchoolIdentity(student?.schoolId ?? session?.schoolId);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const [doneTerminated, setDoneTerminated] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [seconds, setSeconds] = useState<number | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [resultId, setResultId] = useState<string | null>(null);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const [fsGate, setFsGate] = useState(false);
  const attemptIdRef = useRef<string | null>(null);
  const facePresenceRef = useRef<{ faceStatus: string; faceCount: number | null; cameraActive: boolean }>({
    faceStatus: "unknown",
    faceCount: null,
    cameraActive: false,
  });
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const liveCamPublisherRef = useRef<LiveCamPublisher | null>(null);
  const finishingRef = useRef(false);
  const startedRef = useRef(false);
  const doneRef = useRef(false);
  const resultIdRef = useRef<string | null>(null);
  startedRef.current = started;
  doneRef.current = done;
  resultIdRef.current = resultId;

  const examQ = useQuery({
    queryKey: ["cbt-exam", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("examinations")
        .select("id, title, status, duration_minutes, scheduled_start, scheduled_end, course_id, school_id, description, courses(code, name)")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const settingsQ = useQuery({
    queryKey: ["cbt-settings", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data } = await supabase.from("exam_settings")
        .select("exam_id, fullscreen, tab_monitoring, max_tab_switches, block_copy_paste, randomize_questions, randomize_options, require_camera, require_microphone, face_detection, max_face_warnings, require_screen_share, screen_share_mode, threshold_action, face_violation_action, total_marks, instructions, result_visibility, questions_to_answer")
        .eq("exam_id", id).maybeSingle();
      return data as ExamSettingsRow | null;
    },
  });

  const questionsQ = useQuery({
    queryKey: ["cbt-questions", id, examQ.data?.course_id],
    enabled: Boolean(examQ.data?.course_id),
    queryFn: async () => {
      const exam = examQ.data!;
      let q = supabase.from("questions")
        .select("id, question_text, question_type, marks, correct_answer, explanation")
        .eq("course_id", exam.course_id!).in("status", ["active", "approved"])
        .order("created_at", { ascending: true }).limit(200);
      if (exam.school_id) q = q.eq("school_id", exam.school_id);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const security = useMemo(() => fromExamSettingsRow(settingsQ.data, examQ.data?.description), [settingsQ.data, examQ.data?.description]);

  const stopLiveCamStream = useCallback(() => {
    liveCamPublisherRef.current?.stop();
    liveCamPublisherRef.current = null;
  }, []);

  const shutdownMedia = useCallback(() => {
    stopLiveCamStream();
    stopMediaStream(mediaStreamRef.current);
    mediaStreamRef.current = null;
    setLiveStream(null);
  }, [stopLiveCamStream]);

  const invalidateStudentExamCaches = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["student-attempts"] }),
      qc.invalidateQueries({ queryKey: ["student-result-ids"] }),
      qc.invalidateQueries({ queryKey: ["student-exams"] }),
      qc.invalidateQueries({ queryKey: ["student-results"] }),
      qc.invalidateQueries({ queryKey: ["student-dashboard-exams"] }),
      qc.invalidateQueries({ queryKey: ["student-dashboard-attempts"] }),
      qc.invalidateQueries({ queryKey: ["student-dashboard-results"] }),
      qc.invalidateQueries({ queryKey: ["student-history-results"] }),
      qc.invalidateQueries({ queryKey: ["student-history-attempts"] }),
    ]);
  }, [qc]);

  useEffect(() => {
    if (previewMode || !student?.studentId || !id) return;
    void (async () => {
      const { data } = await supabase.from("exam_attempts").select("id, status")
        .eq("exam_id", id).eq("student_id", student.studentId).maybeSingle();
      if (data && ["submitted", "terminated", "flagged"].includes(String(data.status))) {
        shutdownMedia();
        setDoneTerminated(String(data.status) === "terminated");
        setDone(true);
        const { data: res } = await supabase
          .from("results")
          .select("id")
          .eq("exam_id", id)
          .eq("student_id", student.studentId)
          .maybeSingle();
        if (res?.id) setResultId(res.id as string);
      }
    })();
  }, [previewMode, student?.studentId, id, shutdownMedia]);

  useEffect(() => {
    if (!started || done) return;
    const block = (e: Event) => { e.preventDefault(); toast.message("Copy / paste is disabled during the exam"); };
    document.addEventListener("copy", block, true);
    document.addEventListener("paste", block, true);
    document.addEventListener("cut", block, true);
    document.addEventListener("contextmenu", block, true);
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("copy", block, true);
      document.removeEventListener("paste", block, true);
      document.removeEventListener("cut", block, true);
      document.removeEventListener("contextmenu", block, true);
      document.body.style.userSelect = "";
    };
  }, [started, done]);

  // CONTINUED_IN_NEXT_PUSH - partial to avoid size limits
  return null;
}

export { CbtExamPage as CbtExamSession };
