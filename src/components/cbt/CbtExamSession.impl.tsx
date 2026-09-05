import { Link, useParams } from "@tanstack/react-router";
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
  await enterExamImmersive();
  if (document.fullscreenElement) return true;
  try {
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    if (el.requestFullscreen) await el.requestFullscreen();
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
  } catch {
    /* blocked */
  }
  try {
    const { isNativeShell } = await import("@/native/platform");
    if (isNativeShell()) return true;
  } catch {
    /* ignore */
  }
  return Boolean(document.fullscreenElement);
}

async function leaveExamFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen?.();
  } catch {
    /* ignore */
  }
  await exitExamImmersive();
}

export function CbtExamPage() {
  const params = useParams({ strict: false }) as { id?: string };
  const id = params.id ?? "";
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
  const [paused, setPaused] = useState(false);
  const [isOfficerPause, setIsOfficerPause] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const [fsGate, setFsGate] = useState(false);
  const [warnBanner, setWarnBanner] = useState<string | null>(null);
  const [pauseRemainingSec, setPauseRemainingSec] = useState<number | null>(null);
  const [terminationReason, setTerminationReason] = useState("");
  const attemptIdRef = useRef<string | null>(null);
  const finishingRef = useRef(false);
  const endsAtRef = useRef<number | null>(null);
  const pauseUntilRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const doneRef = useRef(false);
  const tabSwitchCountRef = useRef(0);

  const examQ = useQuery({
    queryKey: ["cbt-exam", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("examinations")
        .select(
          "id, title, description, duration_minutes, scheduled_start, scheduled_end, school_id, course_id, questions_to_answer, status, courses(id, code, name, department_id, level_id)",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const settingsQ = useQuery({
    queryKey: ["cbt-exam-settings", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_settings")
        .select("*")
        .eq("exam_id", id)
        .maybeSingle();
      if (error) throw error;
      return data as ExamSettingsRow | null;
    },
  });

  const questionsQ = useQuery({
    queryKey: ["cbt-questions", id, examQ.data?.school_id, examQ.data?.course_id, student?.studentId],
    enabled: Boolean(id && examQ.data),
    queryFn: async () => {
      return loadExamQuestionBank({
        schoolId: examQ.data?.school_id ? String(examQ.data.school_id) : null,
        examId: id || null,
        courseId: examQ.data?.course_id ? String(examQ.data.course_id) : undefined,
      });
    },
  });

  const attemptQ = useQuery({
    queryKey: ["cbt-attempt", id, student?.studentId],
    enabled: Boolean(id && student?.studentId && !previewMode),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_attempts")
        .select("id, status, started_at, ends_at, submitted_at")
        .eq("exam_id", id)
        .eq("student_id", student!.studentId)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const security = useMemo(
    () => fromExamSettingsRow(settingsQ.data ?? null),
    [settingsQ.data],
  );

  const studentKey = String(student?.studentId || student?.matric || session?.userId || "anon");

  const questions = useMemo(() => {
    const bank = questionsQ.data ?? [];
    if (!bank.length) return [];
    try {
      return prepareStudentPaper(bank, {
        questionsToAnswer:
          Number(examQ.data?.questions_to_answer) ||
          Number(settingsQ.data?.questions_to_answer) ||
          null,
        randomizeQuestions: Boolean(security.randomizeQuestions),
        randomizeOptions: Boolean(security.randomizeOptions),
        studentKey,
        examId: id,
      });
    } catch (e) {
      console.warn("[cbt] prepareStudentPaper failed", e);
      return [];
    }
  }, [
    questionsQ.data,
    security.randomizeQuestions,
    security.randomizeOptions,
    examQ.data?.questions_to_answer,
    settingsQ.data?.questions_to_answer,
    studentKey,
    id,
  ]);

  const shutdownMedia = useCallback(() => {
    holdExamScreenShare(false);
    stopMediaStream(mediaStreamRef.current);
    mediaStreamRef.current = null;
    setLiveStream(null);
    try {
      stopScreenShareStream(screenStreamRef.current);
    } catch {
      /* ignore */
    }
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
      try {
        haptic("strong");
      } catch {
        /* ignore */
      }
    },
    [security.pauseDurationSeconds],
  );

  useEffect(() => {
    if (!paused || pauseUntilRef.current == null) return;
    const tick = () => {
      const until = pauseUntilRef.current;
      if (until == null) return;
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setPauseRemainingSec(left);
      if (left <= 0) {
        clearTimedPause();
      }
    };
    tick();
    const t = window.setInterval(tick, 250);
    return () => window.clearInterval(t);
  }, [paused, clearTimedPause]);

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
    doneRef.current = done;
  }, [done]);

  useExamAttemptHeartbeat({
    attemptId: attemptIdRef.current,
    enabled: started && !done && !previewMode,
  });

  useEffect(() => {
    if (!started || done || previewMode) return;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        tabSwitchCountRef.current += 1;
        const max = Math.max(1, Number(security.maxTabSwitches) || 5);
        const count = tabSwitchCountRef.current;
        void logSecurityEvent({
          schoolId: String(examQ.data?.school_id || student?.schoolId || ""),
          examId: id,
          attemptId: attemptIdRef.current,
          studentId: String(student?.studentId || ""),
          eventType: "TAB_SWITCH",
          severity: count >= max ? "high" : "low",
          description: `Tab switch ${count}/${max}`,
          questionIndex: index,
        });
        setWarnBanner(`Stay on the exam. Switches: ${count}/${max}`);
        window.setTimeout(() => setWarnBanner(null), 4000);
        if (count >= max) {
          const action = security.thresholdAction || "flag";
          if (action === "auto_submit") {
            void finishAttempt(true);
          } else if (action === "terminate") {
            setTerminationReason("Exam terminated due to repeated tab switches.");
            setDoneTerminated(true);
            setDone(true);
            shutdownMedia();
          } else {
            beginTimedPause(`Too many tab switches (${count}/${max}).`);
          }
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [
    started,
    done,
    previewMode,
    security.maxTabSwitches,
    security.thresholdAction,
    examQ.data?.school_id,
    student?.schoolId,
    student?.studentId,
    id,
    index,
    beginTimedPause,
    shutdownMedia,
  ]);

  useEffect(() => {
    if (!started || done || !security.fullscreen) return;
    const onFs = () => {
      if (!document.fullscreenElement) setFsGate(true);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, [started, done, security.fullscreen]);

  useEffect(() => {
    return () => {
      shutdownMedia();
      void leaveExamFullscreen();
    };
  }, [shutdownMedia]);

  async function finishAttempt(auto = false) {
    if (finishingRef.current || doneRef.current) return;
    finishingRef.current = true;
    try {
      const paper = questions.map((qq) => ({
        id: qq.id,
        marks: Number(qq.marks) || 1,
        correct_answer: qq.correct_answer ?? null,
        correctOptionText: (qq as { correctOptionText?: string | null }).correctOptionText ?? null,
        originalOptions: (qq as { originalOptions?: string[] }).originalOptions,
        options: qq.options || [],
      }));
      const sid = String(student?.studentId || "");
      const schoolId = String(examQ.data?.school_id || student?.schoolId || "");
      if (!sid || !schoolId) throw new Error("Missing student or school for result save");
      const res = await saveCbtResult({
        examId: id,
        attemptId: attemptIdRef.current,
        studentId: sid,
        schoolId,
        answers,
        questions: paper,
        terminated: auto || doneTerminated,
      });
      if (res?.resultId) setResultId(String(res.resultId));
      if (res?.error) throw new Error(res.error.message);
      setDone(true);
      if (auto) {
        setDoneTerminated(true);
        setTerminationReason("Time is up. Your examination was submitted automatically.");
      }
      shutdownMedia();
      void leaveExamFullscreen();
      void qc.invalidateQueries({ queryKey: ["cbt-attempt", id] });
    } catch (e) {
      finishingRef.current = false;
      toast.error(friendlyError(e, "Could not submit examination"));
    }
  }

  async function beginWithMedia(opts: { skipScreenShare: boolean; caps: DeviceCapabilities }) {
    if (mediaBusy) return;
    setMediaBusy(true);
    try {
      primeHaptics();
      if (security.fullscreen) {
        await requestExamFullscreen();
      }
      let cam: MediaStream | null = null;
      if (security.requireCamera) {
        try {
          cam = await openCameraStream({ facingMode: "user" });
          mediaStreamRef.current = cam;
          setLiveStream(cam);
        } catch (e) {
          toast.error(friendlyError(e, "Camera is required for this exam"));
          setMediaBusy(false);
          return;
        }
      }
      if (security.requireMicrophone) {
        try {
          await ensureMicrophonePermission();
        } catch {
          /* non-fatal */
        }
      }
      if (security.requireScreenShare && !opts.skipScreenShare) {
        try {
          const ss = await startScreenShareStream();
          screenStreamRef.current = ss;
          setScreenStream(ss);
          holdExamScreenShare(true);
          onScreenShareEnded(() => {
            holdExamScreenShare(false);
            setScreenStream(null);
            screenStreamRef.current = null;
            setWarnBanner("Screen share ended — reconnect if required.");
            window.setTimeout(() => setWarnBanner(null), 5000);
          });
        } catch (e) {
          toast.error(friendlyError(e, "Screen share is required"));
          setMediaBusy(false);
          return;
        }
      }

      if (!previewMode && student?.studentId) {
        const durationMin = Number(examQ.data?.duration_minutes) || 60;
        const endsAt = new Date(Date.now() + durationMin * 60 * 1000).toISOString();
        const { data: att, error: attErr } = await supabase
          .from("exam_attempts")
          .insert({
            exam_id: id,
            student_id: student.studentId,
            school_id: examQ.data?.school_id,
            status: "in_progress",
            started_at: new Date().toISOString(),
            ends_at: endsAt,
          })
          .select("id, ends_at")
          .single();
        if (attErr) {
          const existing = attemptQ.data;
          if (existing?.id && !isExamAttemptFinished(existing.status)) {
            attemptIdRef.current = String(existing.id);
            if (existing.ends_at) endsAtRef.current = new Date(existing.ends_at).getTime();
          } else {
            throw attErr;
          }
        } else {
          attemptIdRef.current = String(att.id);
          endsAtRef.current = new Date(att.ends_at || endsAt).getTime();
        }
      } else {
        const durationMin = Number(examQ.data?.duration_minutes) || 60;
        endsAtRef.current = Date.now() + durationMin * 60 * 1000;
      }

      setSeconds(Math.max(0, Math.ceil(((endsAtRef.current || Date.now()) - Date.now()) / 1000)));
      setStarted(true);
      try {
        haptic("success");
      } catch {
        /* ignore */
      }
    } catch (e) {
      toast.error(friendlyError(e, "Could not start examination"));
      shutdownMedia();
    } finally {
      setMediaBusy(false);
    }
  }

  if (examQ.isLoading || settingsQ.isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-600">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium">Loading examination…</p>
        </div>
      </div>
    );
  }

  if (examQ.error || !examQ.data) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center">
        <p className="text-lg font-bold text-slate-900">Examination not found</p>
        <p className="text-sm text-slate-600">{friendlyError(examQ.error, "This exam could not be loaded.")}</p>
        <Button asChild>
          <Link to="/student/examinations">Back to examinations</Link>
        </Button>
      </div>
    );
  }

  if (!previewMode && student && examQ.data) {
    const eligible = isStudentEligibleForExam(student, {
        school_id: examQ.data.school_id,
        course_id: examQ.data.course_id,
        courses: Array.isArray((examQ.data as { courses?: unknown }).courses)
          ? null
          : (examQ.data as { courses?: { department_id?: string | null; level_id?: string | null } | null }).courses,
      });
    if (!eligible) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center">
          <p className="text-lg font-bold text-slate-900">Not eligible for this exam</p>
          <p className="max-w-sm text-sm text-slate-600">
            This examination is not available for your department or level.
          </p>
          <Button asChild>
            <Link to="/student/examinations">Back to examinations</Link>
          </Button>
        </div>
      );
    }
  }

  if (done) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center">
        <div className="w-full max-w-sm rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-xl font-extrabold text-slate-900">
            {previewMode
              ? "Preview ended"
              : doneTerminated
                ? terminationReason.toLowerCase().includes("automatically")
                  ? "Examination auto-submitted"
                  : "Examination terminated"
                : "Examination completed"}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {previewMode
              ? "Officer preview finished."
              : doneTerminated
                ? terminationReason || "Your examination was closed due to a security rule."
                : "Your answers were submitted successfully."}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            {resultId ? (
              <Button asChild>
                <Link to="/student/results/$id" params={{ id: resultId }}>
                  View result
                </Link>
              </Button>
            ) : null}
            <Button variant="outline" asChild>
              <Link to="/student">Go to dashboard</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!started) {
    const course = Array.isArray((examQ.data as { courses?: unknown }).courses)
      ? null
      : (examQ.data as { courses?: { code?: string; name?: string } | null }).courses;
    const courseCode = course?.code ?? "";
    const courseName = course?.name ?? "";
    const courseLine = [courseCode, courseName].filter(Boolean).join(" · ") || "—";

    return (
      <ExamSecurityGate
        examTitle={examQ.data.title}
        courseLine={courseLine}
        durationMinutes={Number(examQ.data.duration_minutes) || 60}
        totalQuestions={questions.length || Number(examQ.data.questions_to_answer) || 0}
        security={security}
        schoolLogoUrl={schoolBrand?.logoUrl ?? session?.schoolLogoUrl}
        schoolName={schoolBrand?.name ?? session?.schoolName}
        windowLabel={formatExamWindow(examQ.data.scheduled_start, examQ.data.scheduled_end)}
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
            <p className="text-[11px] text-slate-500">
              Q{index + 1}/{total || "—"} · {answered} answered
            </p>
          </div>
          <div
            className={cn(
              "rounded-lg px-2.5 py-1 font-mono text-sm font-bold tabular-nums",
              seconds != null && seconds < 60 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-800",
            )}
          >
            {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
          </div>
        </div>
        {warnBanner ? (
          <div className="mx-auto mt-1 max-w-3xl rounded-md bg-amber-50 px-2 py-1 text-center text-xs font-semibold text-amber-900">
            {warnBanner}
          </div>
        ) : null}
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-3 py-4">
        {questionsQ.isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-slate-600">Loading questions…</span>
          </div>
        ) : !q ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <p className="font-semibold text-slate-800">No questions available</p>
            <p className="text-sm text-slate-500">Contact your teacher if this is unexpected.</p>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-start justify-between gap-2">
              <p className="text-base font-medium leading-relaxed text-slate-900">{q.question_text}</p>
              <button
                type="button"
                className={cn(
                  "shrink-0 rounded-lg p-2",
                  flagged.has(q.id) ? "bg-amber-100 text-amber-700" : "bg-slate-50 text-slate-400",
                )}
                onClick={() =>
                  setFlagged((prev) => {
                    const n = new Set(prev);
                    if (n.has(q.id)) n.delete(q.id);
                    else n.add(q.id);
                    return n;
                  })
                }
                aria-label="Flag question"
              >
                <Flag className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {(q.options || []).map((opt, oi) => {
                const selected = answers[q.id] === oi;
                return (
                  <button
                    key={oi}
                    type="button"
                    className={cn(
                      "rounded-xl border px-4 py-3 text-left text-sm font-medium transition",
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-slate-200 bg-white text-slate-800 hover:border-slate-300",
                    )}
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                  >
                    <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold">
                      {String.fromCharCode(65 + oi)}
                    </span>
                    {opt}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 flex items-center justify-between gap-2">
              <Button
                variant="outline"
                disabled={index <= 0}
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> Previous
              </Button>
              {index < total - 1 ? (
                <Button onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}>
                  Next <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    if (window.confirm("Submit examination now?")) void finishAttempt(false);
                  }}
                >
                  Submit
                </Button>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-1.5">
              {questions.slice(0, 60).map((qq, i) => (
                <button
                  key={qq.id}
                  type="button"
                  className={cn(
                    "h-8 w-8 rounded-md text-xs font-bold",
                    i === index
                      ? "bg-primary text-white"
                      : answers[qq.id] != null
                        ? "bg-emerald-100 text-emerald-800"
                        : flagged.has(qq.id)
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-600",
                  )}
                  onClick={() => setIndex(i)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </>
        )}
      </main>

      {security.requireCamera && liveStream ? (
        <ExamCameraPip
          stream={liveStream}
          enabled={started && !done}
          faceDetection={Boolean(security.faceDetection)}
          maxFaceWarnings={Number(security.maxFaceWarnings) || 3}
          onSecurityEvent={(ev: FaceSecurityEvent) => {
            const kind = String(ev.kind || "ok");
            if (kind === "none" || kind === "multi" || kind === "unclear") {
              try {
                haptic(kind === "multi" ? "multi" : kind === "unclear" ? "unclear" : "none");
              } catch {
                /* ignore */
              }
            }
            if (!student?.studentId || !examQ.data?.school_id) return;
            try {
              const mapped = mapFaceSecurityEvent(kind, ev.faceCount ?? null);
              void logSecurityEvent({
                schoolId: String(examQ.data.school_id),
                examId: id,
                attemptId: attemptIdRef.current,
                studentId: student.studentId,
                eventType: mapped.eventType,
                severity: mapped.severity,
                description: mapped.description,
              });
            } catch {
              /* ignore */
            }
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
                  {String(Math.floor(pauseRemainingSec / 60)).padStart(2, "0")}:
                  {String(pauseRemainingSec % 60).padStart(2, "0")}
                </p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-extrabold">Pause completed</h2>
                <Button className="mt-4 w-full" onClick={() => void clearTimedPause()}>
                  Resume Exam
                </Button>
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
            <Button
              className="mt-4 w-full"
              onClick={() => void requestExamFullscreen().then((ok) => ok && setFsGate(false))}
            >
              Return to fullscreen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export { CbtExamPage as CbtExamSession };
