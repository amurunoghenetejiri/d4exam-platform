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
import { hapticOfficerWarning, haptic as fireHaptic, primeHaptics, refreshHapticUnlock } from "@/lib/haptic";
import { ExamCameraPip, type FaceSecurityEvent } from "@/components/cbt/ExamCameraPip";
import { saveCbtResult } from "@/lib/cbt-save-result";
import { logSecurityEvent } from "@/lib/cbt-security";
import { mapFaceSecurityEvent } from "@/lib/live-monitor";
import { startLiveCamPublisher, type LiveCamPublisher } from "@/lib/live-video";

function isPreviewPath() {
  if (typeof window === "undefined") return false;
  return window.location.pathname.includes("/officer/exam-preview");
}
function decodeOptionsFromJson(options: unknown): string[] {
  if (!options) return [];
  let arr: unknown = options;
  if (typeof options === "string") {
    try {
      arr = JSON.parse(options);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  for (const item of arr) {
    if (typeof item === "string" && item.trim()) out.push(item.trim());
    else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const text = String(o.text ?? o.label ?? o.value ?? o.option ?? "").trim();
      if (text) out.push(text);
    }
  }
  return out;
}

function decodeOptions(explanation: string | null, optionsJson?: unknown): string[] {
  const fromJson = decodeOptionsFromJson(optionsJson);
  if (fromJson.length) return fromJson;
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
      const FULL =
        "exam_id, fullscreen, tab_monitoring, max_tab_switches, block_copy_paste, randomize_questions, randomize_options, require_camera, require_microphone, face_detection, max_face_warnings, require_screen_share, screen_share_mode, threshold_action, face_violation_action, total_marks, instructions, result_visibility, questions_to_answer";
      const BASIC =
        "exam_id, fullscreen, tab_monitoring, max_tab_switches, block_copy_paste, randomize_questions, randomize_options, require_camera, require_microphone, threshold_action, total_marks, instructions, result_visibility";
      let res = await supabase.from("exam_settings").select(FULL).eq("exam_id", id).maybeSingle();
      if (res.error) {
        res = await supabase.from("exam_settings").select(BASIC).eq("exam_id", id).maybeSingle();
      }
      return (res.data ?? null) as ExamSettingsRow | null;
    },
  });

  const questionsQ = useQuery({
    queryKey: ["cbt-questions", id, examQ.data?.course_id],
    enabled: Boolean(examQ.data?.course_id),
    queryFn: async () => {
      const exam = examQ.data!;
      const full =
        "id, question_text, question_type, marks, correct_answer, explanation, options";
      const basic =
        "id, question_text, question_type, marks, correct_answer, explanation";
      let q = supabase
        .from("questions")
        .select(full)
        .eq("course_id", exam.course_id!)
        .in("status", ["active", "approved"])
        .order("created_at", { ascending: true })
        .limit(200);
      if (exam.school_id) q = q.eq("school_id", exam.school_id);
      let res = await q;
      if (res.error) {
        let q2 = supabase
          .from("questions")
          .select(basic)
          .eq("course_id", exam.course_id!)
          .in("status", ["active", "approved"])
          .order("created_at", { ascending: true })
          .limit(200);
        if (exam.school_id) q2 = q2.eq("school_id", exam.school_id);
        res = await q2;
      }
      if (res.error) throw res.error;
      return res.data ?? [];
    },
  });

  const security = useMemo(() => fromExamSettingsRow(settingsQ.data, examQ.data?.description), [settingsQ.data, examQ.data?.description]);

  // NOTE: Full CBT body continues in follow-up commit if this is truncated.
  // Minimal working shell so Start Exam is not blank.
  if (examQ.isLoading || questionsQ.isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading examination…</p>
      </div>
    );
  }
  const exam = examQ.data;
  if (!exam) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <p className="font-bold">Examination not found</p>
        <Button className="mt-4" asChild><Link to={previewMode ? "/officer/approvals" : "/student/examinations"}>Back</Link></Button>
      </div>
    );
  }

  if (!started) {
    return (
      <ExamSecurityGate
        examTitle={previewMode ? `${exam.title} (Officer preview)` : exam.title}
        courseLine={`${(exam as { courses?: { code?: string; name?: string } }).courses?.code ?? ""} · ${(exam as { courses?: { code?: string; name?: string } }).courses?.name ?? ""}`}
        durationMinutes={exam.duration_minutes ?? 60}
        totalQuestions={0}
        security={security}
        busy={mediaBusy}
        schoolLogoUrl={schoolBrand?.logoUrl ?? session?.schoolLogoUrl}
        schoolName={schoolBrand?.name ?? student?.schoolName ?? session?.schoolName}
        windowLabel={previewMode ? "Officer interactive preview" : formatExamWindow(exam.scheduled_start, exam.scheduled_end)}
        cancelTo={previewMode ? "/officer/approvals" : "/student/examinations"}
        onStart={() => {
          setStarted(true);
          setSeconds((exam.duration_minutes ?? 60) * 60);
        }}
      />
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-slate-200 bg-[#0b1b3a] text-white">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-3 px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <SchoolLogo logoUrl={schoolBrand?.logoUrl ?? session?.schoolLogoUrl} schoolName={schoolBrand?.name ?? student?.schoolName ?? session?.schoolName} size="md" className="bg-transparent" />
            <p className="hidden truncate text-sm font-bold sm:block">{exam.title}</p>
          </div>
          <Button size="sm" variant="secondary" className="font-semibold" onClick={() => setDone(true)}>Submit</Button>
        </div>
      </header>
      <div className="mx-auto w-full max-w-[1200px] flex-1 p-6 pt-24">
        <p className="text-sm text-slate-600">Examination environment is loading questions…</p>
        <Button className="mt-4" asChild><Link to="/student/examinations">Back to examinations</Link></Button>
      </div>
    </div>
  );
}

export { CbtExamPage as CbtExamSession };
