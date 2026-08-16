import { Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Flag, ChevronLeft, ChevronRight, Loader2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SchoolLogo } from "@/components/brand/SchoolLogo";
import { useSchoolIdentity } from "@/lib/school-identity";
import { ExamSecurityGate } from "@/components/cbt/ExamSecurityGate";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useStudentContext, examAvailability, formatExamWindow } from "@/lib/student";
import { useSessionUser } from "@/lib/session";
import { saveCbtResult } from "@/lib/cbt-save-result";
import { friendlyError } from "@/lib/friendly-error";
import { parseQuestionOptions } from "@/lib/question-options";
import {
  fromExamSettingsRow,
  resolveScreenShareMode,
  DEFAULT_EXAM_SECURITY,
  type ExamSettingsRow,
} from "@/lib/exam-security";
import { createFaceEngine, type FaceEngine } from "@/lib/face-detector";
import { type DeviceCapabilities } from "@/lib/device-capabilities";
import type { ExamSecuritySettings } from "@/types";
import { toast } from "sonner";

type ExamDetail = {
  id: string;
  title: string;
  status: string;
  duration_minutes: number;
  scheduled_start: string | null;
  scheduled_end: string | null;
  course_id: string | null;
  school_id: string;
  description: string | null;
  courses: { code: string; name: string } | null;
};

type QRow = {
  id: string;
  question_text: string;
  question_type: string;
  marks: number;
  correct_answer: string | null;
  explanation: string | null;
  options?: unknown;
};

type FaceState = "ok" | "none" | "multi" | "unknown" | "unavailable";

function isPreviewPath() {
  if (typeof window === "undefined") return false;
  return window.location.pathname.includes("/officer/exam-preview");
}

export function CbtExamPage() {
  const params = useParams({ strict: false }) as { id?: string };
  const id = params.id ?? "";
  const previewMode = isPreviewPath();
  const { data: session } = useSessionUser();
  const { data: student } = useStudentContext();
  const { data: schoolBrand } = useSchoolIdentity(session?.schoolId ?? student?.schoolId);

  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const [doneTerminated, setDoneTerminated] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [seconds, setSeconds] = useState(0);
  const [faceStatus, setFaceStatus] = useState<FaceState>("unknown");
  const [camReady, setCamReady] = useState(false);
  const [pip, setPip] = useState({ x: 12, y: 12 });
  const dragState = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const faceEngineRef = useRef<FaceEngine | null>(null);
  const faceWarnCountRef = useRef(0);
  const attemptIdRef = useRef<string | null>(null);
  const tabSwitchesRef = useRef(0);

  const examQ = useQuery({
    queryKey: ["cbt-exam-full", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("examinations")
        .select(
          "id, title, status, duration_minutes, scheduled_start, scheduled_end, course_id, school_id, description, courses(code, name)",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as ExamDetail | null;
    },
  });

  const settingsQ = useQuery({
    queryKey: ["cbt-exam-settings", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const cols =
        "exam_id, fullscreen, tab_monitoring, max_tab_switches, block_copy_paste, randomize_questions, randomize_options, require_camera, require_microphone, face_detection, max_face_warnings, require_screen_share, screen_share_mode, threshold_action, face_violation_action, total_marks, instructions, result_visibility, questions_to_answer";
      const { data, error } = await supabase.from("exam_settings").select(cols).eq("exam_id", id).maybeSingle();
      if (error) {
        const { data: d2 } = await supabase
          .from("exam_settings")
          .select(
            "exam_id, fullscreen, tab_monitoring, max_tab_switches, block_copy_paste, randomize_questions, randomize_options, require_camera, require_microphone, threshold_action, total_marks, instructions, result_visibility",
          )
          .eq("exam_id", id)
          .maybeSingle();
        return (d2 as ExamSettingsRow | null) ?? null;
      }
      return (data as ExamSettingsRow | null) ?? null;
    },
  });

  const security: ExamSecuritySettings = useMemo(() => {
    return fromExamSettingsRow(settingsQ.data, examQ.data?.description) ?? DEFAULT_EXAM_SECURITY;
  }, [settingsQ.data, examQ.data?.description]);

  const qsQ = useQuery({
    queryKey: ["cbt-qs-full", id, examQ.data?.course_id, examQ.data?.school_id],
    enabled: Boolean(examQ.data?.course_id),
    queryFn: async () => {
      const courseId = examQ.data!.course_id!;
      const schoolId = examQ.data!.school_id;
      let q = supabase
        .from("questions")
        .select("id, question_text, question_type, marks, correct_answer, explanation, options")
        .eq("course_id", courseId)
        .in("status", ["active", "approved"])
        .order("created_at", { ascending: true })
        .limit(200);
      if (schoolId) q = q.eq("school_id", schoolId);
      const { data, error } = await q;
      if (error) {
        const fb = await supabase
          .from("questions")
          .select("id, question_text, question_type, marks, correct_answer, explanation")
          .eq("course_id", courseId)
          .in("status", ["active", "approved"])
          .limit(200);
        if (fb.error) throw error;
        return (fb.data ?? []) as QRow[];
      }
      return (data ?? []) as QRow[];
    },
  });

  const questions = useMemo(() => {
    return (qsQ.data ?? []).map((q) => {
      const parsed = parseQuestionOptions({
        options: q.options,
        explanation: q.explanation,
        correct_answer: q.correct_answer,
      });
      return { ...q, options: parsed.map((o) => o.text) };
    });
  }, [qsQ.data]);

  const TOTAL = questions.length;
  const current = questions[idx];

  const stopMedia = useCallback(() => {
    camStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    camStreamRef.current = null;
    screenStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    faceEngineRef.current?.close();
    faceEngineRef.current = null;
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
  }, []);

  const requestCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: Boolean(security.requireMicrophone),
      });
      camStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCamReady(true);
      if (security.faceDetection) {
        try {
          faceEngineRef.current = await createFaceEngine();
          if (!faceEngineRef.current) setFaceStatus("unavailable");
        } catch {
          setFaceStatus("unavailable");
        }
      }
      return true;
    } catch {
      toast.error("Camera is required for this examination. Allow access and try again.");
      setCamReady(false);
      return false;
    }
  };

  const requestScreenShare = async () => {
    try {
      // @ts-expect-error getDisplayMedia
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      screenStreamRef.current = stream;
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        toast.warning("Screen share ended");
      });
      return true;
    } catch {
      toast.error("Screen sharing is required for this examination.");
      return false;
    }
  };

  useEffect(() => {
    if (!started || !security.faceDetection || !camReady) return;
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      const engine = faceEngineRef.current;
      const video = videoRef.current;
      if (!engine || !video || video.readyState < 2) {
        setFaceStatus(engine ? "unknown" : "unavailable");
      } else {
        try {
          const n = await engine.count(video);
          if (n == null) {
            setFaceStatus("unknown");
          } else if (n === 0) {
            setFaceStatus("none");
            faceWarnCountRef.current += 1;
            if (faceWarnCountRef.current >= (security.maxFaceWarnings || 5)) {
              const action = security.faceViolationAction || security.thresholdAction || "flag";
              if (action === "terminate") {
                toast.error("Too many face warnings — exam terminated");
                void finishAttempt(true);
                return;
              }
              toast.warning("Multiple face warnings recorded");
            }
          } else if (n > 1) {
            setFaceStatus("multi");
            faceWarnCountRef.current += 1;
          } else {
            setFaceStatus("ok");
          }
        } catch {
          setFaceStatus("unknown");
        }
      }
      window.setTimeout(() => void tick(), 1500);
    };
    void tick();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, camReady, security.faceDetection, security.maxFaceWarnings]);

  useEffect(() => {
    if (!started || done) return;
    const onVis = () => {
      if (document.hidden && security.tabMonitoring) {
        tabSwitchesRef.current += 1;
        toast.warning(`Tab switch counted (${tabSwitchesRef.current}/${security.maxTabSwitches || 5})`);
        if (tabSwitchesRef.current >= (security.maxTabSwitches || 5)) {
          if (security.thresholdAction === "terminate") {
            toast.error("Too many tab switches — exam terminated");
            void finishAttempt(true);
          }
        }
      }
    };
    const onFs = () => {
      if (security.fullscreen && !document.fullscreenElement && !done) {
        toast.message("Please return to fullscreen");
        void document.documentElement.requestFullscreen?.().catch(() => {});
      }
    };
    const block = (e: Event) => {
      if (security.blockCopyPaste) {
        e.preventDefault();
        toast.message("Copy / paste is disabled during this exam");
      }
    };
    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("paste", block);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("paste", block);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, done, security]);

  useEffect(() => {
    if (!started || done) return;
    if (seconds <= 0) {
      void finishAttempt(true);
      return;
    }
    const t = window.setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, done, seconds]);

  async function finishAttempt(auto = false) {
    if (done) return;
    const terminated =
      auto &&
      (security.thresholdAction === "terminate" || security.faceViolationAction === "terminate");
    if (previewMode) {
      stopMedia();
      setDoneTerminated(Boolean(terminated));
      setDone(true);
      toast.message("Preview ended — no student attempt or result was saved");
      return;
    }
    try {
      if (!examQ.data || !student?.studentId) throw new Error("Missing exam or student");
      const res = await saveCbtResult({
        examId: examQ.data.id,
        studentId: student.studentId,
        schoolId: examQ.data.school_id,
        attemptId: attemptIdRef.current,
        questions: questions.map((q) => ({
          id: q.id,
          marks: q.marks,
          correct_answer: q.correct_answer,
          options: q.options,
        })),
        answers,
        terminated: Boolean(terminated),
        faceWarned: faceWarnCountRef.current > 0,
      });
      if (res.error) toast.error(res.error.message);
      else toast.success("Exam submitted");
    } catch (err) {
      toast.error(friendlyError(err, "Could not submit exam"));
    } finally {
      stopMedia();
      setDoneTerminated(Boolean(terminated));
      setDone(true);
    }
  }

  async function beginWithMedia(opts: { skipScreenShare: boolean; caps: DeviceCapabilities }) {
    setMediaBusy(true);
    try {
      const shareMode = resolveScreenShareMode(security);
      if (security.requireCamera) {
        const camOk = await requestCamera();
        if (!camOk) return;
      }
      if (!opts.skipScreenShare && (shareMode === "required" || shareMode === "optional")) {
        if (opts.caps.screenShare) {
          const scrOk = await requestScreenShare();
          if (!scrOk && shareMode === "required") return;
        } else if (shareMode === "required") {
          toast.warning("This examination requires a desktop browser with screen-sharing support.");
          return;
        }
      }
      if (!previewMode && student?.studentId && examQ.data) {
        const { data } = await supabase
          .from("exam_attempts")
          .insert({
            exam_id: id,
            student_id: student.studentId,
            school_id: examQ.data.school_id,
            status: "in_progress",
            started_at: new Date().toISOString(),
          } as never)
          .select("id")
          .maybeSingle();
        if (data?.id) attemptIdRef.current = data.id as string;
      }
      if (security.fullscreen) {
        try {
          await document.documentElement.requestFullscreen?.();
        } catch {
          toast.message("Please allow fullscreen");
        }
      }
      setSeconds((examQ.data?.duration_minutes || 30) * 60);
      setStarted(true);
      setIdx(0);
    } finally {
      setMediaBusy(false);
    }
  }

  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  const backTo = previewMode ? "/officer/approvals" : "/student/examinations";

  if (examQ.isLoading || qsQ.isLoading || settingsQ.isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading examination…
        </p>
      </div>
    );
  }

  const exam = examQ.data;
  if (!exam) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <p className="font-bold text-slate-900">Examination not found</p>
          <Button className="mt-4" asChild>
            <Link to={backTo}>Back</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!previewMode) {
    const avail = examAvailability(exam.status, exam.scheduled_start, exam.scheduled_end);
    if (avail !== "available" && !done) {
      return (
        <div className="grid min-h-dvh place-items-center p-4 text-center">
          <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-lg font-extrabold">
              {avail === "missed" ? "Exam missed" : "Not available yet"}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {formatExamWindow(exam.scheduled_start, exam.scheduled_end)}
            </p>
            <Button className="mt-6" asChild>
              <Link to="/student/examinations">Back to exams</Link>
            </Button>
          </div>
        </div>
      );
    }
  }

  if (done) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-50 p-4">
        <div className="w-full max-w-lg rounded-2xl border bg-white p-6 text-center shadow-sm">
          <SchoolLogo
            logoUrl={schoolBrand?.logoUrl ?? session?.schoolLogoUrl}
            schoolName={schoolBrand?.name ?? session?.schoolName}
            size="lg"
            className="mx-auto"
          />
          <h1 className="mt-4 text-2xl font-extrabold">
            {previewMode ? "Preview ended" : "Examination completed"}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {previewMode
              ? "Officer preview finished. Same security path as students — nothing was saved."
              : doneTerminated
                ? "Your attempt was closed by the security system."
                : "Your answers were submitted. Results appear after officer release."}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {!previewMode && (
              <Button className="font-semibold" asChild>
                <Link to="/student/results">Go to My Results</Link>
              </Button>
            )}
            <Button variant="outline" className="font-semibold" asChild>
              <Link to={backTo}>{previewMode ? "Back to approvals" : "Back to examinations"}</Link>
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
        courseLine={`${exam.courses?.code ?? ""} · ${exam.courses?.name ?? ""}`}
        durationMinutes={exam.duration_minutes}
        totalQuestions={TOTAL}
        security={security}
        busy={mediaBusy}
        schoolLogoUrl={schoolBrand?.logoUrl ?? session?.schoolLogoUrl}
        schoolName={schoolBrand?.name ?? session?.schoolName}
        windowLabel={
          previewMode
            ? "Officer interactive preview · identical security to students"
            : formatExamWindow(exam.scheduled_start, exam.scheduled_end)
        }
        onStart={(opts) => void beginWithMedia(opts)}
      />
    );
  }

  if (TOTAL === 0) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <p className="font-bold">No active questions for this course</p>
          <Button className="mt-4" asChild>
            <Link to={backTo}>Back</Link>
          </Button>
        </div>
      </div>
    );
  }

  const faceDot =
    !security.requireCamera || !security.faceDetection
      ? null
      : faceStatus === "ok"
        ? "bg-emerald-400"
        : faceStatus === "none" || faceStatus === "multi"
          ? "bg-amber-400"
          : "bg-slate-400";

  return (
    <div className="min-h-dvh bg-slate-100">
      {previewMode && (
        <div className="bg-amber-500 px-3 py-1.5 text-center text-xs font-bold text-white">
          OFFICER PREVIEW — same security as students · answers are not saved
        </div>
      )}
      <div className="mx-auto max-w-3xl space-y-3 p-3 sm:p-4">
        <header className="flex items-center justify-between gap-3 rounded-xl bg-slate-900 px-3 py-2 text-white">
          <div className="flex min-w-0 items-center gap-2">
            <SchoolLogo
              logoUrl={schoolBrand?.logoUrl ?? session?.schoolLogoUrl}
              schoolName={schoolBrand?.name ?? session?.schoolName ?? "School"}
              size="sm"
              className="ring-1 ring-white/20"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{exam.title}</p>
              <p className="truncate text-xs text-white/70">{exam.courses?.code}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {faceDot && (
              <span className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-1 text-[11px]">
                <span className={cn("h-2 w-2 rounded-full", faceDot)} /> Face
              </span>
            )}
            <span className="rounded-full bg-white/10 px-3 py-1 font-mono text-sm font-bold tabular-nums">
              {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
            </span>
            <Button
              size="sm"
              className="h-8 bg-white text-slate-900 hover:bg-white/90"
              onClick={() => void finishAttempt(false)}
            >
              {previewMode ? "End preview" : "Submit"}
            </Button>
          </div>
        </header>

        {current && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-primary">
                Question {idx + 1} of {TOTAL}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => setFlagged((f) => ({ ...f, [current.id]: !f[current.id] }))}
              >
                <Flag className="mr-1 h-3.5 w-3.5" />{" "}
                {flagged[current.id] ? "Flagged" : "Mark for Review"}
              </Button>
            </div>
            <p className="text-base font-semibold text-slate-900">{current.question_text}</p>
            <div className="mt-4 space-y-2">
              {(current.options.length ? current.options : ["True", "False"]).map((opt, i) => {
                const selected = answers[current.id] === i;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setAnswers((a) => ({ ...a, [current.id]: i }))}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left text-sm transition",
                      selected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-slate-200 hover:border-slate-300",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-bold",
                        selected
                          ? "border-primary bg-primary text-white"
                          : "border-slate-300",
                      )}
                    >
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="pt-0.5">{opt}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex justify-between">
              <Button
                size="sm"
                variant="outline"
                disabled={idx <= 0}
                onClick={() => setIdx((v) => Math.max(0, v - 1))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> Previous
              </Button>
              <Button
                size="sm"
                className="font-semibold"
                disabled={idx >= TOTAL - 1}
                onClick={() => setIdx((v) => Math.min(TOTAL - 1, v + 1))}
              >
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-xl border bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Questions</p>
          <div className="flex flex-wrap gap-1.5">
            {questions.map((q, i) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setIdx(i)}
                className={cn(
                  "h-9 w-9 rounded-lg text-xs font-bold",
                  i === idx
                    ? "bg-primary text-white"
                    : answers[q.id] != null
                      ? "bg-slate-200"
                      : "bg-slate-100",
                )}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Answered {Object.keys(answers).length} / {TOTAL}
          </p>
        </div>
      </div>

      {security.requireCamera && camReady && (
        <div
          className="fixed z-50 overflow-hidden rounded-xl border-2 border-white shadow-xl"
          style={{ right: pip.x, bottom: pip.y, width: 140 }}
        >
          <div
            className="flex cursor-grab items-center gap-1 bg-slate-900 px-2 py-1 text-[10px] text-white active:cursor-grabbing"
            onPointerDown={(e) => {
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              dragState.current = { ox: e.clientX, oy: e.clientY, px: pip.x, py: pip.y };
            }}
            onPointerMove={(e) => {
              if (!dragState.current) return;
              const dx = e.clientX - dragState.current.ox;
              const dy = e.clientY - dragState.current.oy;
              setPip({
                x: Math.max(8, dragState.current.px - dx),
                y: Math.max(8, dragState.current.py - dy),
              });
            }}
            onPointerUp={() => {
              dragState.current = null;
            }}
          >
            <GripVertical className="h-3 w-3" /> Camera
          </div>
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            className="aspect-video w-full scale-x-[-1] bg-black object-cover"
          />
          <div
            className={cn(
              "px-2 py-0.5 text-center text-[10px] font-bold text-white",
              faceStatus === "multi" && "bg-red-600",
              faceStatus === "none" && "bg-amber-600",
              faceStatus === "ok" && "bg-emerald-600",
              (faceStatus === "unknown" || faceStatus === "unavailable") && "bg-primary",
            )}
          >
            {faceStatus === "multi"
              ? "Multiple faces"
              : faceStatus === "none"
                ? "Face not seen"
                : faceStatus === "ok"
                  ? "Monitoring · 1 face"
                  : faceStatus === "unavailable"
                    ? "Camera off"
                    : "Live camera"}
          </div>
        </div>
      )}
    </div>
  );
}
