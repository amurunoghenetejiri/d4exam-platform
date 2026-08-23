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
import { parseExamMeta } from "@/lib/exam-meta";
import { loadExamQuestionBank, prepareStudentPaper } from "@/lib/cbt-load-questions";
import { type DeviceCapabilities } from "@/lib/device-capabilities";
import { toast } from "sonner";
import { ExamCameraPip, type FaceSecurityEvent } from "@/components/cbt/ExamCameraPip";
import { saveCbtResult } from "@/lib/cbt-save-result";
import { logSecurityEvent } from "@/lib/cbt-security";
import { mapFaceSecurityEvent } from "@/lib/live-monitor";

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
  if (document.fullscreenElement) return true;
  try {
    await document.documentElement.requestFullscreen?.();
  } catch { /* blocked */ }
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
  const mediaStreamRef = useRef<MediaStream | null>(null);
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

  const security = useMemo(() => fromExamSettingsRow(settingsQ.data, examQ.data?.description), [settingsQ.data, examQ.data?.description]);

  const shutdownMedia = useCallback(() => {
    stopMediaStream(mediaStreamRef.current);
    mediaStreamRef.current = null;
    setLiveStream(null);
  }, []);

  useEffect(() => {
    if (!started || done || seconds == null) return;
    if (seconds <= 0) { void finishAttempt(true); return; }
    const t = window.setInterval(() => setSeconds((s) => (s == null ? s : Math.max(0, s - 1))), 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, done, seconds === 0]);

  useEffect(() => {
    if (done) {
      shutdownMedia();
      setFsGate(false);
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    }
  }, [done, shutdownMedia]);

  useEffect(() => () => {
    stopMediaStream(mediaStreamRef.current);
    mediaStreamRef.current = null;
  }, []);

  const questionsToAnswer = useMemo(() => {
    const row = (settingsQ.data as { questions_to_answer?: number } | null)?.questions_to_answer;
    if (typeof row === "number" && row > 0) return Math.floor(row);
    const meta = parseExamMeta(examQ.data?.description);
    return meta.questionsToAnswer && meta.questionsToAnswer > 0 ? meta.questionsToAnswer : null;
  }, [settingsQ.data, examQ.data?.description]);

  const questions = useMemo(() => {
    const key = student?.studentId ?? (previewMode ? "officer-preview" : session?.userId ?? "anon");
    return prepareStudentPaper((questionsQ.data ?? []) as never, {
      questionsToAnswer,
      randomizeQuestions: Boolean(security.randomizeQuestions),
      randomizeOptions: Boolean(security.randomizeOptions),
      studentKey: key,
      examId: id,
    });
  }, [questionsQ.data, questionsToAnswer, security.randomizeQuestions, security.randomizeOptions, student?.studentId, session?.userId, previewMode, id]);

  const TOTAL = questions.length;
  const q = questions[index];
  const answeredCount = Object.keys(answers).length;

  const onFaceSecurityEvent = useCallback((ev: FaceSecurityEvent) => {
    if (previewMode) return;
    const mapped = mapFaceSecurityEvent(ev.kind, ev.faceCount);
    const schoolId = String(examQ.data?.school_id ?? student?.schoolId ?? session?.schoolId ?? "");
    const studentId = student?.studentId;
    if (!schoolId || !studentId || !id) return;
    void logSecurityEvent({
      schoolId, examId: id, attemptId: attemptIdRef.current, studentId,
      eventType: mapped.eventType, severity: mapped.severity, description: mapped.description,
      extra: { faceCount: ev.faceCount, source: "ExamCameraPip" },
    });
  }, [previewMode, examQ.data?.school_id, student?.studentId, student?.schoolId, session?.schoolId, id]);

  async function requestSubmit() {
    if (done || finishingRef.current || previewMode) return;
    const unanswered = Math.max(0, TOTAL - answeredCount);
    const msg = unanswered > 0
      ? `You have ${unanswered} unanswered question${unanswered === 1 ? "" : "s"}. Submit this examination anyway?`
      : "Submit this examination now?";
    if (!window.confirm(msg)) return;
    await finishAttempt(false);
  }

  async function finishAttempt(auto = false) {
    if (done || finishingRef.current) return;
    finishingRef.current = true;
    shutdownMedia();
    setFsGate(false);
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
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
          const { data } = await supabase.from("exam_attempts").upsert({
            exam_id: id, student_id: student.studentId, school_id: examQ.data?.school_id,
            status: "in_progress", started_at: new Date().toISOString(), answers,
          } as never, { onConflict: "exam_id,student_id" }).select("id").maybeSingle();
          attemptId = (data?.id as string) ?? null;
          attemptIdRef.current = attemptId;
        }
        const schoolId = String(examQ.data.school_id ?? student.schoolId ?? "");
        const saved = await saveCbtResult({
          examId: id, studentId: student.studentId, schoolId, attemptId,
          questions: questions.map((qq) => ({
            id: qq.id, marks: qq.marks ?? 1, correct_answer: qq.correct_answer,
            options: qq.options ?? [],
            originalOptions: (qq as { originalOptions?: string[] }).originalOptions ?? [],
            correctOptionText: (qq as { correctOptionText?: string | null }).correctOptionText ?? null,
          })),
          answers, terminated: auto, resultVisibility: security.resultVisibility,
        });
        if (saved.error) toast.error(saved.error.message);
        else {
          let rid = saved.resultId ?? null;
          if (!rid) {
            const { data: res } = await supabase.from("results").select("id").eq("exam_id", id).eq("student_id", student.studentId).maybeSingle();
            rid = (res?.id as string) ?? null;
          }
          if (rid) { setResultId(rid); resultIdRef.current = rid; }
          toast.success(saved.published ? "Examination submitted — result is available now" : "Examination submitted successfully");
        }
        await qc.invalidateQueries({ queryKey: ["student-exams"] });
      } else toast.success(auto ? "Examination closed" : "Examination submitted successfully");
    } catch (e) { toast.error(friendlyError(e, "Could not save result")); }
    setDoneTerminated(auto);
    setDone(true);
    shutdownMedia();
    finishingRef.current = false;
  }

  async function beginWithMedia(_opts: { skipScreenShare: boolean; caps: DeviceCapabilities }) {
    setMediaBusy(true);
    try {
      if (!previewMode && student?.studentId) {
        const { data: existing } = await supabase.from("exam_attempts").select("id, status").eq("exam_id", id).eq("student_id", student.studentId).maybeSingle();
        if (existing && ["submitted", "terminated", "flagged"].includes(String(existing.status))) {
          toast.error("You have already completed this examination.");
          shutdownMedia(); setDone(true); return;
        }
        if (existing?.id) attemptIdRef.current = existing.id as string;
      }
      const needCam = Boolean(security.requireCamera);
      const needMic = Boolean(security.requireMicrophone);
      if (needCam || needMic) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: needCam, audio: needMic });
          stopMediaStream(mediaStreamRef.current);
          mediaStreamRef.current = stream;
          setLiveStream(stream);
          toast.success(needCam ? "Camera ready" : "Microphone ready");
        } catch {
          toast.error(needCam ? "Camera is required for this examination." : "Microphone is required for this examination.");
          return;
        }
      }
      if (security.fullscreen) {
        const ok = await requestExamFullscreen();
        if (!ok) { toast.message("Please allow fullscreen to continue the exam"); setFsGate(true); }
      }
      if (!previewMode && student?.studentId && examQ.data?.school_id) {
        if (!attemptIdRef.current) {
          const { data } = await supabase.from("exam_attempts").upsert({
            exam_id: id, student_id: student.studentId, school_id: examQ.data?.school_id,
            status: "in_progress", started_at: new Date().toISOString(), answers: {},
          } as never, { onConflict: "exam_id,student_id" }).select("id").maybeSingle();
          if (data?.id) attemptIdRef.current = data.id as string;
        }
      }
      setSeconds((examQ.data?.duration_minutes ?? 60) * 60);
      setStarted(true);
      setIndex(0);
    } finally { setMediaBusy(false); }
  }

  async function restoreFullscreenFromUser() {
    const ok = await requestExamFullscreen();
    if (ok) { setFsGate(false); toast.success("Fullscreen restored"); }
    else toast.error("Could not enter fullscreen.");
  }

  async function goToResult() {
    shutdownMedia();
    let targetId = resultIdRef.current || resultId;
    if (student?.studentId && !targetId) {
      const { data: res } = await supabase.from("results").select("id").eq("exam_id", id).eq("student_id", student.studentId).maybeSingle();
      targetId = (res?.id as string) ?? null;
    }
    void navigate({ to: "/student/results/$id", params: { id: targetId || id } });
  }

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
  if (done) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-50 p-4">
        <div className="w-full max-w-lg rounded-2xl border bg-white p-6 text-center shadow-sm">
          <SchoolLogo logoUrl={schoolBrand?.logoUrl ?? session?.schoolLogoUrl} schoolName={schoolBrand?.name ?? session?.schoolName} size="lg" className="mx-auto" />
          <h1 className="mt-4 text-2xl font-extrabold">{previewMode ? "Preview ended" : "Examination completed"}</h1>
          <p className="mt-2 text-sm text-slate-600">
            {previewMode ? "Officer preview finished." : doneTerminated ? "Your attempt was closed." : "Your answers were submitted successfully."}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {!previewMode && (<Button className="font-semibold" onClick={() => void goToResult()}>View Results</Button>)}
            <Button variant="outline" className="font-semibold" asChild>
              <Link to={previewMode ? "/officer/approvals" : "/student/examinations"}>{previewMode ? "Back" : "Back to examinations"}</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }
  if (!started) {
    return (
      <ExamSecurityGate
        examTitle={previewMode ? `${exam.title} (Officer preview)` : exam.title}
        courseLine={`${(exam as { courses?: { code?: string; name?: string } }).courses?.code ?? ""} · ${(exam as { courses?: { code?: string; name?: string } }).courses?.name ?? ""}`}
        durationMinutes={exam.duration_minutes ?? 60}
        totalQuestions={TOTAL}
        security={security}
        busy={mediaBusy}
        schoolLogoUrl={schoolBrand?.logoUrl ?? session?.schoolLogoUrl}
        schoolName={schoolBrand?.name ?? student?.schoolName ?? session?.schoolName}
        windowLabel={previewMode ? "Officer interactive preview" : formatExamWindow(exam.scheduled_start, exam.scheduled_end)}
        cancelTo={previewMode ? "/officer/approvals" : "/student/examinations"}
        onStart={(opts) => void beginWithMedia(opts)}
      />
    );
  }
  if (TOTAL === 0) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <p className="font-bold">No active questions for this course</p>
        <Button className="mt-4" asChild><Link to={previewMode ? "/officer/approvals" : "/student/examinations"}>Back</Link></Button>
      </div>
    );
  }
  const mm = String(Math.floor((seconds ?? 0) / 60)).padStart(2, "0");
  const ss = String((seconds ?? 0) % 60).padStart(2, "0");
  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 select-none">
      {previewMode && (
        <div className="bg-amber-500 px-3 py-1.5 text-center text-xs font-bold text-white">
          OFFICER PREVIEW — answers are not saved
        </div>
      )}
      <header className="fixed inset-x-0 top-0 z-40 border-b border-slate-200 bg-[#0b1b3a] text-white">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-3 px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <SchoolLogo logoUrl={schoolBrand?.logoUrl ?? session?.schoolLogoUrl} schoolName={schoolBrand?.name ?? student?.schoolName ?? session?.schoolName} size="md" className="bg-transparent" />
            <p className="hidden truncate text-sm font-bold sm:block">{(exam as { courses?: { code?: string } }).courses?.code ?? "EXAM"} — {exam.title}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-white/10 px-3 py-1.5 font-mono text-sm font-bold tabular-nums">{mm}:{ss}</div>
            <Button size="sm" variant="secondary" className="font-semibold" onClick={() => void requestSubmit()}>Submit</Button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-[1200px] flex-1 grid-cols-1 gap-4 p-3 pt-[calc(4rem+0.75rem)] sm:p-6 sm:pt-[calc(4rem+1.5rem)] lg:grid-cols-[220px_1fr]">
        <aside className="order-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:order-1">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Questions</p>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {questions.map((qq, i) => {
              const answered = answers[qq.id] != null;
              const isFlag = flagged.has(qq.id);
              const isCurrent = i === index;
              return (
                <button key={qq.id} type="button" onClick={() => setIndex(i)}
                  className={cn("grid h-9 place-items-center rounded-md text-xs font-bold transition",
                    isCurrent && "bg-primary text-white ring-2 ring-primary/30",
                    !isCurrent && answered && "bg-emerald-500 text-white",
                    !isCurrent && isFlag && !answered && "bg-amber-400 text-slate-900",
                    !isCurrent && !answered && !isFlag && "border border-slate-200 bg-white text-slate-700 hover:border-primary")}>
                  {i + 1}
                </button>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-slate-500">Answered <span className="font-bold text-slate-800">{answeredCount}</span> / {TOTAL}</p>
        </aside>
        <section className="order-1 flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:order-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-primary">Question <span className="text-primary">{index + 1}</span> of {TOTAL}</p>
            <button type="button" onClick={() => {
              if (!q) return;
              setFlagged((prev) => { const next = new Set(prev); if (next.has(q.id)) next.delete(q.id); else next.add(q.id); return next; });
            }} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold",
              q && flagged.has(q.id) ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-600")}>
              <Flag className="h-3.5 w-3.5" />{q && flagged.has(q.id) ? "Marked" : "Mark for Review"}
            </button>
          </div>
          <h1 className="mt-4 text-lg font-bold leading-snug text-slate-900 sm:text-xl">{q?.question_text}</h1>
          <ul className="mt-6 space-y-3">
            {(q?.options ?? []).map((opt, oi) => {
              const selected = q ? answers[q.id] === oi : false;
              return (
                <li key={oi}>
                  <button type="button" onClick={() => {
                    if (q) setAnswers((a) => ({ ...a, [q.id]: oi }));
                  }}
                    className={cn("flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition",
                      selected ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-slate-200 hover:border-primary/40")}>
                    <span className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-bold",
                      selected ? "border-primary bg-primary text-white" : "border-slate-300 text-slate-500")}>{String.fromCharCode(65 + oi)}</span>
                    <span>{opt}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
            <Button variant="outline" className="rounded-lg font-semibold" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Previous
            </Button>
            <Button className="rounded-lg font-semibold" disabled={index >= TOTAL - 1} onClick={() => setIndex((i) => Math.min(TOTAL - 1, i + 1))}>
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </section>
      </div>
      {started && !done && security.requireCamera && (
        <ExamCameraPip
          enabled={started && !done}
          faceDetection={Boolean(security.faceDetection || security.requireCamera)}
          maxFaceWarnings={security.maxFaceWarnings ?? 3}
          stream={liveStream}
          onSecurityEvent={onFaceSecurityEvent}
          onNeedReconnect={() => {}}
        />
      )}
      {fsGate && security.fullscreen && started && !done && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary"><Maximize className="h-6 w-6" /></div>
            <h2 className="text-lg font-extrabold text-slate-900">Fullscreen required</h2>
            <p className="mt-2 text-sm text-slate-600">Tap below to continue in fullscreen.</p>
            <Button className="mt-5 w-full font-semibold" onClick={() => void restoreFullscreenFromUser()}>
              <Maximize className="mr-2 h-4 w-4" /> Return to fullscreen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export { CbtExamPage as CbtExamSession };
