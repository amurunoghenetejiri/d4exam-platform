import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { ExamSecurityGate } from "@/components/cbt/ExamSecurityGate";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fromExamSettingsRow } from "@/lib/exam-security";
import { formatExamWindow } from "@/lib/student";

export const Route = createFileRoute("/officer/exam-preview/$id")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Exam security preview — D4EXAM" }],
  }),
  component: OfficerExamPreview,
});

function OfficerExamPreview() {
  const { id } = Route.useParams();

  const examQ = useQuery({
    queryKey: ["officer-exam-preview", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("examinations")
        .select(
          "id, title, status, duration_minutes, scheduled_start, scheduled_end, description, school_id, course_id, courses(code, name)",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const settingsQ = useQuery({
    queryKey: ["officer-exam-preview-settings", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data } = await supabase
        .from("exam_settings")
        .select(
          "require_camera, face_detection, max_face_warnings, require_microphone, fullscreen, tab_monitoring, max_tab_switches, block_copy_paste, screen_share_mode, threshold_action, face_violation_action, require_screen_share",
        )
        .eq("exam_id", id)
        .maybeSingle();
      return data;
    },
  });

  const questionsQ = useQuery({
    queryKey: ["officer-exam-preview-qcount", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { count } = await supabase
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("exam_id", id);
      return count ?? 0;
    },
  });

  if (examQ.isLoading || settingsQ.isLoading) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading preview…
        </p>
      </div>
    );
  }

  const exam = examQ.data;
  if (!exam) {
    return (
      <div className="grid min-h-[50vh] place-items-center p-6 text-center">
        <div>
          <p className="font-bold">Examination not found</p>
          <Button className="mt-4" asChild>
            <Link to="/officer/approvals">Back to approvals</Link>
          </Button>
        </div>
      </div>
    );
  }

  const security = fromExamSettingsRow(settingsQ.data, exam.description);
  const totalQ = questionsQ.data ?? 0;
  const course = exam.courses as { code?: string; name?: string } | null;
  const courseLine = `${course?.code ?? ""} · ${course?.name ?? ""}`;

  return (
    <div className="min-h-dvh bg-slate-50">
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm font-semibold text-amber-900">
        Officer preview — same security checks students will see. Starting does not create a real attempt.
      </div>
      <div className="mx-auto max-w-3xl px-4 py-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/officer/approvals">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to approvals
          </Link>
        </Button>
      </div>
      <ExamSecurityGate
        examTitle={exam.title}
        courseLine={courseLine}
        durationMinutes={exam.duration_minutes ?? 60}
        totalQuestions={totalQ}
        security={security}
        busy={false}
        continueMode={false}
        windowLabel={formatExamWindow(exam.scheduled_start, exam.scheduled_end)}
        onStart={() => {
          toast.success(
            "Preview complete. Camera / face / fullscreen behave as on the student side. Request changes if anything must be adjusted.",
          );
        }}
      />
    </div>
  );
}
