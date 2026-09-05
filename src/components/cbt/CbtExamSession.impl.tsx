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
import { useStudentContext, formatExamWindow, isExamAttemptFinished } from "@/lib/student";
import { useSessionUser } from "@/lib/session";
import { friendlyError } from "@/lib/friendly-error";
import { fromExamSettingsRow, type ExamSettingsRow } from "@/lib/exam-security";
import { parseExamMeta } from "@/lib/exam-meta";
import { loadExamQuestionBank, prepareStudentPaper } from "@/lib/cbt-load-questions";
import { type DeviceCapabilities } from "@/lib/device-capabilities";
import { toast } from "sonner";
import { ExamCameraPip, type FaceSecurityEvent } from "@/components/cbt/ExamCameraPip";
import { saveCbtResult } from "@/lib/cbt-save-result";
import { logSecurityEvent } from "@/lib/cbt-security";
import { mapFaceSecurityEvent } from "@/lib/live-monitor";
import { openCameraStream, ensureMicrophonePermission } from "@/native/cameraService";
import { enterExamImmersive, exitExamImmersive } from "@/native/statusBar";
import { haptic, primeHaptics } from "@/lib/haptic";
import { startScreenShareStream, onScreenShareEnded, stopScreenShareStream, holdExamScreenShare } from "@/lib/screen-share";
import { useLiveScreenPublish } from "@/lib/use-live-screen-publish";
import { useLiveCamPublish } from "@/lib/use-live-cam-publish";
import { useExamAttemptHeartbeat } from "@/lib/use-exam-attempt-heartbeat";

function isPreviewPath() {
  if (typeof window === "undefined") return false;
  return window.location.pathname.includes("/officer/exam-preview");
}

function stopMediaStream(stream: MediaStream | null | undefined) {
  if (!stream) return;
  try {
    for (const t of stream.getTracks()) {
      try { t.stop(); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

async function requestExamFullscreen(): Promise<boolean> {
  if (typeof document === "undefined") return false;
  await enterExamImmersive();
  if (document.fullscreenElement) return true;
  try {
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    if (el.requestFullscreen) await el.requestFullscreen();
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
  } catch { /* blocked */ }
  try {
    const { isNativeShell } = await import("@/native/platform");
    if (isNativeShell()) return true;
  } catch { /* ignore */ }
  return Boolean(document.fullscreenElement);
}

async function leaveExamFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen?.();
  } catch { /* ignore */ }
  await exitExamImmersive();
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
  const [paused, setPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState<string>("");
  const [warnBanner, setWarnBanner] = useState<string | null>(null);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [pauseRemainingSec, setPauseRemainingSec] = useState<number | null>(null);
  const [isOfficerPause, setIsOfficerPause] = useState(false);
  const attemptIdRef = useRef<string | null>(null);
  const tabSwitchCountRef = useRef(0);
  const fullscreenExitCountRef = useRef(0);
  const lastViolationAtRef = useRef(0);
  const lastTabHiddenAtRef = useRef(0);
  const orderedIdsRef = useRef<string[] | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const cameraReconnectLockRef = useRef(false);
  const pauseUntilRef = useRef<number | null>(null);
  const endsAtRef = useRef<number | null>(null);
  const officerPauseRef = useRef(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const [liveAttemptId, setLiveAttemptId] = useState<string | null>(null);
  const finishingRef = useRef(false);
  const startedRef = useRef(false);
  const doneRef = useRef(false);
  const pausedRef = useRef(false);
  const faceStatusForLiveRef = useRef<string>("ok");
  const resultIdRef = useRef<string | null>(null);
  startedRef.current = started;
  doneRef.current = done;
  pausedRef.current = paused;
  resultIdRef.current = resultId;

  const examQ = useQuery({
    queryKey: ["cbt-exam", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("examinations")
        .select("id, title, status, duration_minutes, scheduled_start, scheduled_end, course_id, school_id, description, questions_to_answer, courses(code, name)")
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
        .select("exam_id, fullscreen, tab_monitoring, max_tab_switches, block_copy_paste, randomize_questions, randomize_options, require_camera, require_microphone, face_detection, max_face_warnings, require_screen_share, screen_share_mode, threshold_action, face_violation_action, pause_duration_seconds, total_marks, instructions, result_visibility, questions_to_answer")
        .eq("exam_id", id).maybeSingle();
      return data as ExamSettingsRow | null;
    },
  });

  const questionsQ = useQuery({
    queryKey: ["cbt-questions", id, examQ.data?.course_id, examQ.data?.school_id],
    enabled: Boolean(examQ.data?.course_id),
    queryFn: async () => {
      const exam = examQ.data!;
      return loadExamQuestionBank({
        courseId: String(exam.course_id),
        schoolId: exam.school_id ? String(exam.school_id) : null,
        examId: id || null,
      });
    },
  });

  const priorAttemptQ = useQuery({
    queryKey: ["cbt-prior-attempt", id, student?.studentId],
    enabled: Boolean(id && student?.studentId && !previewMode),
    queryFn: async () => {
      const { data: attempt } = await supabase
        .from("exam_attempts")
        .select("id, status")
        .eq("exam_id", id)
        .eq("student_id", student!.studentId)
        .maybeSingle();
      const { data: result } = await supabase
        .from("results")
        .select("id")
        .eq("exam_id", id)
        .eq("student_id", student!.studentId)
        .maybeSingle();
      return {
        attemptStatus: (attempt?.status as string | undefined) ?? null,
        hasResult: Boolean(result?.id),
        attemptId: (attempt?.id as string | undefined) ?? null,
      };
    },
  });

  const alreadyFinished = !previewMode && isExamAttemptFinished(
    priorAttemptQ.data?.attemptStatus,
    priorAttemptQ.data?.hasResult,
  );

  const security = useMemo(() => fromExamSettingsRow(settingsQ.data, examQ.data?.description), [settingsQ.data, examQ.data?.description]);

  // Full session body continues — temporary safe loading UI until next push completes restore
  if (examQ.isLoading || !examQ.data) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-50 p-6">
        <p className="text-sm text-slate-500">Loading examination…</p>
      </div>
    );
  }

  if (alreadyFinished) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-50 p-4">
        <div className="w-full max-w-lg rounded-2xl border bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">Already completed</h1>
          <p className="mt-2 text-sm text-slate-600">You have already written this examination.</p>
          <Button asChild className="mt-4">
            <Link to="/student/examinations">Back to examinations</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-slate-50 p-6">
      <div className="max-w-md rounded-2xl border bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">{examQ.data.title}</h1>
        <p className="mt-2 text-sm text-slate-600">
          Exam session is being restored. Please refresh in a moment, or contact support if this persists.
        </p>
        <Button asChild className="mt-4" variant="outline">
          <Link to="/student/examinations">Back to examinations</Link>
        </Button>
      </div>
    </div>
  );
}

export { CbtExamPage as CbtExamSession };
