import { Link, useParams, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, ChevronLeft, ChevronRight, Loader2, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExamSecurityGate } from "@/components/cbt/ExamSecurityGate";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  useStudentContext,
  formatExamWindow,
  isExamAttemptFinished,
  isStudentEligibleForExam,
} from "@/lib/student";
import { useSessionUser } from "@/lib/session";
import { friendlyError } from "@/lib/friendly-error";
import { fromExamSettingsRow, type ExamSettingsRow } from "@/lib/exam-security";
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
import {
  startScreenShareStream,
  onScreenShareEnded,
  stopScreenShareStream,
  holdExamScreenShare,
} from "@/lib/screen-share";
import { useExamAttemptHeartbeat } from "@/lib/use-exam-attempt-heartbeat";
import { useSchoolIdentity } from "@/lib/school-identity";

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
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
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
  const [pauseReason, setPauseReason] = useState("");
  const [warnBanner, setWarnBanner] = useState<string | null>(null);
  const [pauseRemainingSec, setPauseRemainingSec] = useState<number | null>(null);
  const [isOfficerPause, setIsOfficerPause] = useState(false);
  const attemptIdRef = useRef<string | null>(null);
  const tabSwitchCountRef = useRef(0);
  const endsAtRef = useRef<number | null>(null);
  const pauseUntilRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [liveAttemptId, setLiveAttemptId] = useState<string | null>(null);
  const finishingRef = useRef(false);
  const startedRef = useRef(false);
  const doneRef = useRef(false);
  const pausedRef = useRef(false);
  const faceStatusForLiveRef = useRef("ok");
  const orderedIdsRef = useRef<string[] | null>(null);
  startedRef.current = started;
  doneRef.current = done;
  pausedRef.current = paused;

  const examQ = useQuery({
    queryKey: ["cbt-exam", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("examinations")
        .select("id, title, status, duration_minutes, scheduled_start, scheduled_end, course_id, school_id, description, questions_to_answer, courses(code, name, department_id, level_id)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const settingsQ = useQuery({
    queryKey: ["cbt-settings", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data } = await supabase
        .from("exam_settings")
        .select("exam_id, fullscreen, tab_monitoring, max_tab_switches, block_copy_paste, randomize_questions, randomize_options, require_camera, require_microphone, face_detection, max_face_warnings, require_screen_share, screen_share_mode, threshold_action, face_violation_action, pause_duration_seconds, total_marks, instructions, result_visibility, questions_to_answer")
        .eq("exam_id", id)
        .maybeSingle();
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

  const alreadyFinished =
    !previewMode &&
    isExamAttemptFinished(priorAttemptQ.data?.attemptStatus, priorAttemptQ.data?.hasResult);

  const examEligible =
    previewMode ||
    !examQ.data ||
    isStudentEligibleForExam(student, {
      school_id: (examQ.data as { school_id?: string | null }).school_id,
      course_id: (examQ.data as { course_id?: string | null }).course_id,
      courses: (examQ.data as { courses?: { department_id?: string | null; level_id?: string | null } | null }).courses,
    });

  const security = useMemo(
    () => fromExamSettingsRow(settingsQ.data, examQ.data?.description),
    [settingsQ.data, examQ.data?.description],
  );

  const shutdownMedia = useCallback(() => {
    holdExamScreenShare(false);
    stopMediaStream(mediaStreamRef.current);
    mediaStreamRef.current = null;
    setLiveStream(null);
    try { stopScreenShareStream(screenStreamRef.current); } catch { /* ignore */ }
    screenStreamRef.current = null;
    setScreenStream(null);
  }, []);

  const clearTimedPause = useCallback(() => {
    pauseUntilRef.current = null;
    setIsOfficerPause(false);
    setPauseRemainingSec(null);
    setPaused(false);
    setPauseReason("");
  }, []);

  const beginTimedPause = useCallback(
    (reason: string) => {
      const secs = Math.max(5, Number(security.pauseDurationSeconds) || 300);
      setIsOfficerPause(false);
      pauseUntilRef.current = Date.now() + secs * 1000;
      setPauseRemainingSec(secs);
      setPauseReason(reason);
      setPaused(true);
      try { haptic("strong"); } catch { /* ignore */ }
    },
    [security.pauseDurationSeconds],
  );

  const questions = useMemo(() => {
    const bank = questionsQ.data ?? [];
    if (!bank.length) return [];
    const paper = prepareStudentPaper(bank, {
      randomizeQuestions: Boolean(security.randomizeQuestions),
      randomizeOptions: Boolean(security.randomizeOptions),
      questionsToAnswer:
        Number(examQ.data?.questions_to_answer) ||
        Number(settingsQ.data?.questions_to_answer) ||
        undefined,
      orderedIds: orderedIdsRef.current,
    });
    if (paper.orderedIds?.length) orderedIdsRef.current = paper.orderedIds;
    return paper.questions;
  }, [questionsQ.data, security.randomizeQuestions, security.randomizeOptions, examQ.data?.questions_to_answer, settingsQ.data?.questions_to_answer]);

  useEffect(() => {
    if (!paused || pauseUntilRef.current == null) return;
    const tick = () => {
      const until = pauseUntilRef.current;
      if (until == null) return;
      setPauseRemainingSec(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    };
    tick();
    const t = window.setInterval(tick, 250);
    return () => window.clearInterval(t);
  }, [paused]);

  useEffect(() => {
    if (!started || done) return;
    const tick = () => {
      const ends = endsAtRef.current;
      if (ends == null) return;
      const left = Math.max(0, Math.ceil((ends - Date.now()) / 1000));
      setSeconds(left);
      if (left <= 0 && !finishingRef.current && !doneRef.current) void finishAttempt(true);
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, done]);

  useEffect(() => {
    if (done) {
      shutdownMedia();
      setFsGate(false);
      setPaused(false);
      void leaveExamFullscreen();
    }
  }, [done, shutdownMedia]);

  useEffect(() => () => {
    stopMediaStream(mediaStreamRef.current);
    mediaStreamRef.current = null;
    void exitExamImmersive();
  }, []);

  useExamAttemptHeartbeat({
    enabled: started && !done && !previewMode,
    attemptId: liveAttemptId || attemptIdRef.current,
  });

  async function finishAttempt(auto = false) {
    if (done || finishingRef.current) return;
    finishingRef.current = true;
    doneRef.current = true;
    setFsGate(false);
    setPaused(false);
    shutdownMedia();
    void leaveExamFullscreen();
    if (previewMode) {
      toast.message("Preview ended — nothing was saved");
      setDone(true);
      finishingRef.current = false;
      return;
    }
    try {
      if (student?.studentId && examQ.data) {
        let attemptId = attemptIdRef.current;
        if (!attemptId) {
          const { data } = await supabase
            .from("exam_attempts")
            .upsert(
              {
                exam_id: id,
                student_id: student.studentId,
                school_id: examQ.data?.school_id,
                status: "in_progress",
                started_at: new Date().toISOString(),
                answers,
              } as never,
              { onConflict: "exam_id,student_id" },
            )
            .select("id")
            .maybeSingle();
          attemptId = (data?.id as string) ?? null;
          attemptIdRef.current = attemptId;
        }
        const schoolId = String(examQ.data.school_id ?? student.schoolId ?? "");
        const saved = await saveCbtResult({
          examId: id,
          studentId: student.studentId,
          schoolId,
          attemptId,
          questions: questions.map((qq) => ({
            id: qq.id,
            marks: qq.marks ?? 1,
            correct_answer: qq.correct_answer,
            options: qq.options ?? [],
            originalOptions: (qq as { originalOptions?: string[] }).originalOptions ?? [],
            correctOptionText: (qq as { correctOptionText?: string | null }).correctOptionText ?? null,
          })),
          answers,
          terminated: auto,
          resultVisibility: security.resultVisibility,
        });
        if (saved.error) toast.error(saved.error.message);
        else {
          let rid = saved.resultId ?? null;
          if (!rid) {
            const { data: res } = await supabase
              .from("results")
              .select("id")
              .eq("exam_id", id)
              .eq("student_id", student.studentId)
              .maybeSingle();
            rid = (res?.id as string) ?? null;
          }
          if (rid) setResultId(rid);
          toast.success(saved.published ? "Submitted — result available" : "Examination submitted");
        }
        await qc.invalidateQueries({ queryKey: ["student-exams"] });
      }
    } catch (e) {
      toast.error(friendlyError(e, "Could not save result"));
    }
    setDoneTerminated(auto);
    setDone(true);
    finishingRef.current = false;
  }

  async function beginWithMedia(_opts: { skipScreenShare: boolean; caps: DeviceCapabilities }) {
    if (!previewMode && !examEligible) {
      toast.error("This examination is not assigned to your department or level.");
      return;
    }
    setMediaBusy(true);
    try {
      try { primeHaptics(); } catch { /* ignore */ }
      if (!previewMode && student?.studentId) {
        const { data: existing } = await supabase
          .from("exam_attempts")
          .select("id, status")
          .eq("exam_id", id)
          .eq("student_id", student.studentId)
          .maybeSingle();
        if (existing && ["submitted", "terminated", "flagged"].includes(String(existing.status))) {
          toast.error("You have already completed this examination.");
          shutdownMedia();
          setDone(true);
          return;
        }
        if (existing?.id) {
          attemptIdRef.current = existing.id as string;
          setLiveAttemptId(existing.id as string);
        }
      }
      const needCam = Boolean(security.requireCamera);
      const needMic = Boolean(security.requireMicrophone);
      if (needCam || needMic) {
        try {
          let stream: MediaStream;
          if (needCam) stream = await openCameraStream({ facingMode: "user", audio: needMic });
          else {
            const mic = await ensureMicrophonePermission();
            if (!mic.granted) throw new Error(mic.error || "Microphone required");
            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          }
          stopMediaStream(mediaStreamRef.current);
          mediaStreamRef.current = stream;
          setLiveStream(stream);
        } catch {
          toast.error(needCam ? "Camera is required for this examination." : "Microphone is required.");
          return;
        }
      }
      if (Boolean(security.requireScreenShare) && !_opts.skipScreenShare) {
        holdExamScreenShare(true);
        const share = await startScreenShareStream();
        if (!share.ok) {
          toast.error(share.error || "Screen share is required.");
          holdExamScreenShare(false);
          return;
        }
        screenStreamRef.current = share.stream;
        setScreenStream(share.stream);
        onScreenShareEnded(() => {
          if (!doneRef.current && startedRef.current) {
            toast.error("Screen share ended.");
          }
        });
      }
      if (security.fullscreen) {
        const ok = await requestExamFullscreen();
        if (!ok) setFsGate(true);
      }
      const mins = Number(examQ.data?.duration_minutes) || 60;
      endsAtRef.current = Date.now() + mins * 60 * 1000;
      setSeconds(mins * 60);
      if (!previewMode && student?.studentId && examQ.data) {
        const { data: att } = await supabase
          .from("exam_attempts")
          .upsert(
            {
              exam_id: id,
              student_id: student.studentId,
              school_id: examQ.data.school_id,
              status: "in_progress",
              started_at: new Date().toISOString(),
            } as never,
            { onConflict: "exam_id,student_id" },
          )
          .select("id")
          .maybeSingle();
        if (att?.id) {
          attemptIdRef.current = att.id as string;
          setLiveAttemptId(att.id as string);
        }
      }
      setStarted(true);
      try { haptic("start"); } catch { /* ignore */ }
    } finally {
      setMediaBusy(false);
    }
  }

  useEffect(() => {
    if (!started || done || previewMode || !security.tabMonitoring) return;
    const onVis = () => {
      if (document.visibilityState === "hidden" && !pausedRef.current) {
        tabSwitchCountRef.current += 1;
        try { haptic("tab_switch"); } catch { /* ignore */ }
        const max = Number(security.maxTabSwitches) || 3;
        if (tabSwitchCountRef.current >= max) beginTimedPause("Tab switch limit reached");
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [started, done, previewMode, security.tabMonitoring, security.maxTabSwitches, beginTimedPause]);

  if (examQ.isLoading || settingsQ.isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-50 p-6">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!examQ.data) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-50 p-6">
        <div className="max-w-md rounded-2xl border bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold">Examination not found</h1>
          <Button asChild className="mt-4"><Link to="/student/examinations">Back</Link></Button>
        </div>
      </div>
    );
  }

  if (!previewMode && !examEligible) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-50 p-4">
        <div className="w-full max-w-lg rounded-2xl border bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">Not eligible for this exam</h1>
          <p className="mt-2 text-sm text-slate-600">
            This examination is for a different department or level. Only students in the matching course (or same department and level) can access it.
          </p>
          <Button asChild className="mt-4"><Link to="/student/examinations">Back to examinations</Link></Button>
        </div>
      </div>
    );
  }

  if (alreadyFinished) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-50 p-4">
        <div className="w-full max-w-lg rounded-2xl border bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">Already completed</h1>
          <p className="mt-2 text-sm text-slate-600">You have already written this examination.</p>
          <Button asChild className="mt-4"><Link to="/student/examinations">Back to examinations</Link></Button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-50 p-4">
        <div className="w-full max-w-lg rounded-2xl border bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">{doneTerminated ? "Examination ended" : "Submitted"}</h1>
          <p className="mt-2 text-sm text-slate-600">
            {doneTerminated ? "Your attempt was closed (time up or terminated)." : "Your answers have been submitted."}
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {resultId ? (
              <Button asChild><Link to="/student/results/$id" params={{ id: resultId }}>View result</Link></Button>
            ) : null}
            <Button asChild variant="outline"><Link to="/student/examinations">Back to examinations</Link></Button>
          </div>
        </div>
      </div>
    );
  }

  if (!started) {
    return (
      <ExamSecurityGate
        examTitle={examQ.data.title}
        courseCode={
          Array.isArray((examQ.data as { courses?: unknown }).courses)
            ? undefined
            : ((examQ.data as { courses?: { code?: string } }).courses?.code ?? undefined)
        }
        durationMinutes={examQ.data.duration_minutes}
        windowText={formatExamWindow(examQ.data.scheduled_start, examQ.data.scheduled_end)}
        security={security}
        schoolLogoUrl={schoolBrand?.logoUrl ?? session?.schoolLogoUrl}
        schoolName={schoolBrand?.name ?? session?.schoolName}
        busy={mediaBusy}
        onStart={(opts) => void beginWithMedia(opts)}
      />
    );
  }

  const q = questions[index];
  const answered = Object.keys(answers).length;
  const total = questions.length;
  const mm = seconds != null ? Math.floor(seconds / 60) : 0;
  const ss = seconds != null ? seconds % 60 : 0;

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <header className="sticky top-0 z-40 border-b bg-white/95 px-3 py-2 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-900">{examQ.data.title}</p>
            <p className="text-[11px] text-slate-500">Q{index + 1}/{total} · {answered} answered</p>
          </div>
          <div className={cn(
            "rounded-lg px-2.5 py-1 font-mono text-sm font-bold tabular-nums",
            seconds != null && seconds < 60 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-800",
          )}>
            {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
          </div>
        </div>
      </header>

      {warnBanner ? (
        <div className="bg-amber-500 px-3 py-2 text-center text-sm font-semibold text-white">{warnBanner}</div>
      ) : null}

      <main className="mx-auto w-full max-w-3xl flex-1 px-3 py-4">
        {q ? (
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-2">
              <p className="text-base font-semibold leading-snug text-slate-900">
                {index + 1}. {(q as { question_text?: string; text?: string }).question_text || (q as { text?: string }).text || "Question"}
              </p>
              <button
                type="button"
                className={cn("shrink-0 rounded-lg p-2", flagged.has(q.id) ? "bg-amber-100 text-amber-700" : "bg-slate-50 text-slate-400")}
                onClick={() => {
                  setFlagged((prev) => {
                    const n = new Set(prev);
                    if (n.has(q.id)) n.delete(q.id);
                    else n.add(q.id);
                    return n;
                  });
                }}
              >
                <Flag className="h-4 w-4" />
              </button>
            </div>
            <ul className="space-y-2">
              {(q.options || []).map((opt: string, oi: number) => {
                const selected = answers[q.id] === oi;
                return (
                  <li key={oi}>
                    <button
                      type="button"
                      className={cn(
                        "w-full rounded-xl border px-3 py-2.5 text-left text-sm",
                        selected ? "border-primary bg-primary/5 font-semibold text-primary" : "border-slate-100 bg-white text-slate-800",
                      )}
                      onClick={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                    >
                      <span className="mr-2 font-bold text-slate-400">{String.fromCharCode(65 + oi)}.</span>
                      {opt}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No questions loaded.</p>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" disabled={index <= 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Prev
          </Button>
          <div className="flex flex-wrap justify-center gap-1">
            {questions.slice(0, 40).map((qq, i) => (
              <button
                key={qq.id}
                type="button"
                className={cn(
                  "h-7 w-7 rounded text-[11px] font-bold",
                  i === index ? "bg-primary text-white" : answers[qq.id] != null ? "bg-emerald-100 text-emerald-800" : flagged.has(qq.id) ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600",
                )}
                onClick={() => setIndex(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>
          {index < total - 1 ? (
            <Button size="sm" onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}>
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => {
                if (window.confirm("Submit examination now?")) void finishAttempt(false);
              }}
            >
              Submit
            </Button>
          )}
        </div>
      </main>

      {security.requireCamera && liveStream ? (
        <ExamCameraPip
          stream={liveStream}
          enabled={started && !done}
          onFaceEvent={(ev: FaceSecurityEvent) => {
            faceStatusForLiveRef.current = ev.status || "ok";
            if (ev.status === "none" || ev.status === "multi") {
              try { haptic(ev.status === "multi" ? "multi" : "none"); } catch { /* ignore */ }
            }
            try {
              void logSecurityEvent({
                examId: id,
                attemptId: attemptIdRef.current,
                type: mapFaceSecurityEvent(ev),
              });
            } catch { /* ignore */ }
          }}
        />
      ) : null}

      {paused && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/90 p-4">
          <div className="w-full max-w-sm rounded-2xl border bg-white p-6 text-center shadow-2xl">
            {isOfficerPause ? (
              <>
                <h2 className="text-lg font-extrabold">Paused by officer</h2>
                <p className="mt-2 text-sm text-slate-600">Wait for the officer to resume your exam.</p>
              </>
            ) : pauseRemainingSec != null && pauseRemainingSec > 0 ? (
              <>
                <h2 className="text-lg font-extrabold">Integrity pause</h2>
                <p className="mt-2 text-sm text-slate-600">{pauseReason || "Please wait."}</p>
                <p className="mt-3 font-mono text-3xl font-extrabold tabular-nums text-primary">
                  {String(Math.floor(pauseRemainingSec / 60)).padStart(2, "0")}:{String(pauseRemainingSec % 60).padStart(2, "0")}
                </p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-extrabold">Pause completed</h2>
                <Button className="mt-4 w-full" onClick={() => void clearTimedPause()}>Resume Exam</Button>
              </>
            )}
          </div>
        </div>
      )}

      {fsGate && security.fullscreen && started && !done && !paused && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/90 p-4">
          <div className="w-full max-w-sm rounded-2xl border bg-white p-6 text-center shadow-2xl">
            <Maximize className="mx-auto mb-2 h-8 w-8 text-primary" />
            <h2 className="text-lg font-extrabold">Fullscreen required</h2>
            <Button className="mt-4 w-full" onClick={() => void requestExamFullscreen().then((ok) => ok && setFsGate(false))}>
              Return to fullscreen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export { CbtExamPage as CbtExamSession };
