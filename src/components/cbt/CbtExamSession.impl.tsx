import { Link, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SchoolLogo } from "@/components/brand/SchoolLogo";
import { useSchoolIdentity } from "@/lib/school-identity";
import { ExamSecurityGate } from "@/components/cbt/ExamSecurityGate";
import { supabase } from "@/integrations/supabase/client";
import { useStudentContext, formatExamWindow } from "@/lib/student";
import { useSessionUser } from "@/lib/session";
import { fromExamSettingsRow } from "@/lib/exam-security";
import { parseExamMeta, pickExamQuestions } from "@/lib/exam-meta";
import { toast } from "sonner";

function isPreviewPath() {
  if (typeof window === "undefined") return false;
  return window.location.pathname.includes("/officer/exam-preview");
}

export function CbtExamPage() {
  const params = useParams({ strict: false }) as { id?: string };
  const id = params.id ?? "";
  const previewMode = isPreviewPath();
  const { data: student } = useStudentContext();
  const { data: session } = useSessionUser();
  const { data: schoolBrand } = useSchoolIdentity(student?.schoolId ?? session?.schoolId);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);

  const examQ = useQuery({
    queryKey: ["cbt-exam", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("examinations")
        .select("id, title, status, duration_minutes, scheduled_start, scheduled_end, course_id, school_id, description, courses(code, name)")
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
        .select("exam_id, fullscreen, tab_monitoring, max_tab_switches, block_copy_paste, randomize_questions, randomize_options, require_camera, require_microphone, face_detection, max_face_warnings, require_screen_share, screen_share_mode, threshold_action, face_violation_action, total_marks, instructions, result_visibility, questions_to_answer")
        .eq("exam_id", id)
        .maybeSingle();
      return data;
    },
  });

  const questionsQ = useQuery({
    queryKey: ["cbt-questions", id, examQ.data?.course_id],
    enabled: Boolean(examQ.data?.course_id),
    queryFn: async () => {
      const exam = examQ.data!;
      const { data, error } = await supabase
        .from("questions")
        .select("id, question_text, question_type, marks, correct_answer, explanation")
        .eq("course_id", exam.course_id!)
        .in("status", ["active", "approved"])
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const security = useMemo(
    () => fromExamSettingsRow(settingsQ.data as never, examQ.data?.description),
    [settingsQ.data, examQ.data?.description],
  );

  const questionsToAnswer = useMemo(() => {
    const row = (settingsQ.data as { questions_to_answer?: number } | null)?.questions_to_answer;
    if (typeof row === "number" && row > 0) return Math.floor(row);
    const meta = parseExamMeta(examQ.data?.description);
    return meta.questionsToAnswer && meta.questionsToAnswer > 0 ? meta.questionsToAnswer : null;
  }, [settingsQ.data, examQ.data?.description]);

  const TOTAL = useMemo(() => {
    const bank = (questionsQ.data ?? []).map((q: { id: string }) => ({ ...q, options: ["A", "B", "C", "D"] }));
    return pickExamQuestions(bank as never, {
      questionsToAnswer,
      randomize: false,
      studentKey: student?.studentId ?? (previewMode ? "officer-preview" : "anon"),
      examId: id,
    }).length;
  }, [questionsQ.data, questionsToAnswer, student?.studentId, previewMode, id]);

  if (examQ.isLoading || questionsQ.isLoading) {
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
          <p className="font-bold">Examination not found</p>
          <Button className="mt-4" asChild>
            <Link to={previewMode ? "/officer/approvals" : "/student/examinations"}>Back</Link>
          </Button>
        </div>
      </div>
    );
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
              ? "Nothing was saved."
              : "Your answers were submitted. You cannot rewrite this examination."}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            {!previewMode && (
              <Button asChild>
                <Link to="/student/results">View Results</Link>
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link to={previewMode ? "/officer/approvals" : "/student/examinations"}>Back</Link>
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
        totalQuestions={TOTAL || 0}
        security={security}
        schoolLogoUrl={schoolBrand?.logoUrl ?? session?.schoolLogoUrl}
        schoolName={schoolBrand?.name ?? student?.schoolName ?? session?.schoolName}
        windowLabel={
          previewMode ? "Officer preview" : formatExamWindow(exam.scheduled_start, exam.scheduled_end)
        }
        cancelTo={previewMode ? "/officer/approvals" : "/student/examinations"}
        onStart={() => {
          toast.message(previewMode ? "Preview started" : "Examination started");
          setStarted(true);
        }}
      />
    );
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-slate-50 p-6">
      <div className="w-full max-w-lg rounded-2xl border bg-white p-6 text-center shadow-sm">
        <p className="font-bold text-slate-900">Exam session active</p>
        <p className="mt-2 text-sm text-slate-600">
          Questions available: {TOTAL}.{previewMode ? " Preview mode — answers not saved." : ""}
        </p>
        <Button className="mt-6" onClick={() => setDone(true)}>
          End session
        </Button>
      </div>
    </div>
  );
}

export { CbtExamPage as CbtExamSession };
