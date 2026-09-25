import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send } from "lucide-react";
import { PageHeader, SectionCard, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useSessionUser } from "@/lib/session";
import { useStudentContext } from "@/lib/student";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/student/contact-officer")({
  head: () => ({
    meta: [
      { title: "Contact officer — D4EXAM" },
      { name: "description", content: "Send exam issues and messages to your departmental examination officer." },
    ],
  }),
  component: Page,
});

type ExamOpt = { id: string; title: string };
type ReportRow = {
  id: string;
  exam_id: string | null;
  exam_title: string | null;
  subject: string | null;
  body: string;
  status: string | null;
  officer_reply: string | null;
  replied_at: string | null;
  created_at: string;
};

function Page() {
  const { data: session } = useSessionUser();
  const { data: student } = useStudentContext();
  const qc = useQueryClient();
  const schoolId = session?.schoolId ?? student?.schoolId;
  const studentId = student?.studentId;
  const [examId, setExamId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const examsQ = useQuery({
    queryKey: ["student-contact-exams", schoolId, studentId],
    enabled: Boolean(schoolId),
    queryFn: async () => {
      if (!schoolId) return [] as ExamOpt[];
      // Prefer student's attempts; fall back to published/approved exams in school
      if (studentId) {
        const { data } = await supabase
          .from("exam_attempts")
          .select("exam_id, examinations(id, title)")
          .eq("student_id", studentId)
          .order("created_at", { ascending: false })
          .limit(40);
        const map = new Map<string, string>();
        for (const a of data ?? []) {
          const ex = (a as { examinations?: { id?: string; title?: string } | null }).examinations;
          const id = ex?.id || (a as { exam_id?: string }).exam_id;
          if (id && ex?.title) map.set(String(id), String(ex.title));
        }
        if (map.size) return [...map.entries()].map(([id, title]) => ({ id, title }));
      }
      const { data: exams } = await supabase
        .from("examinations")
        .select("id, title")
        .eq("school_id", schoolId)
        .in("status", ["published", "approved", "scheduled", "active", "closed"])
        .order("created_at", { ascending: false })
        .limit(40);
      return (exams ?? []).map((e) => ({
        id: String((e as { id: string }).id),
        title: String((e as { title?: string }).title || "Examination"),
      }));
    },
  });

  const mineQ = useQuery({
    queryKey: ["student-my-reports", schoolId, studentId, session?.userId],
    enabled: Boolean(schoolId && (studentId || session?.userId)),
    refetchInterval: 20_000,
    queryFn: async () => {
      let q = supabase
        .from("student_officer_reports")
        .select(
          "id, exam_id, exam_title, subject, body, status, officer_reply, replied_at, created_at",
        )
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (studentId) q = q.eq("student_id", studentId);
      else if (session?.userId) q = q.eq("student_user_id", session.userId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ReportRow[];
    },
  });

  const exams = examsQ.data ?? [];
  const examTitle = useMemo(
    () => exams.find((e) => e.id === examId)?.title || null,
    [exams, examId],
  );

  async function submit() {
    if (!schoolId || !body.trim()) {
      toast.error("Write a short message about the issue.");
      return;
    }
    setBusy(true);
    try {
      const name =
        session?.fullName || student?.fullName || "Student";
      const matric = student?.matric || null;
      const { error } = await supabase.from("student_officer_reports").insert({
        school_id: schoolId,
        student_id: studentId || null,
        student_user_id: session?.userId || null,
        student_name: name,
        student_matric: matric,
        exam_id: examId || null,
        exam_title: examTitle,
        subject: subject.trim() || "Exam report",
        body: body.trim(),
        status: "open",
      } as never);
      if (error) throw error;
      toast.success("Report sent to your examination officer");
      setBody("");
      setSubject("");
      await qc.invalidateQueries({ queryKey: ["student-my-reports"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not send";
      if (/relation|does not exist|schema cache/i.test(msg)) {
        toast.error("Reports are not set up yet. Ask your admin to run the student_officer_reports SQL.");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  const mine = mineQ.data ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Contact officer"
        description="Report an exam issue or message your departmental examination officer. They can reply here."
      />

      <SectionCard title="New message">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Examination (optional)</label>
            <select
              value={examId}
              onChange={(e) => setExamId(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="">General (not tied to one exam)</option>
              {exams.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Subject</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Timer issue during CBT"
              className="h-10"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Your message</label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Describe what happened during the exam or what you need help with…"
              className="min-h-[120px] text-sm"
            />
          </div>
          <Button type="button" className="font-semibold" disabled={busy} onClick={() => void submit()}>
            <Send className="mr-1.5 h-4 w-4" />
            Send to officer
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Your reports">
        {mineQ.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : mine.length === 0 ? (
          <EmptyState
            title="No reports yet"
            description="Messages you send appear here, including officer replies."
          />
        ) : (
          <ul className="space-y-3">
            {mine.map((r) => {
              const st = String(r.status || "open").toLowerCase();
              return (
                <li key={r.id} className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">
                        {r.subject || "Report"}
                        {r.exam_title ? (
                          <span className="ml-1.5 text-xs font-normal text-slate-500">
                            · {r.exam_title}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {new Date(r.created_at).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                        st === "replied"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-800",
                      )}
                    >
                      {st}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{r.body}</p>
                  {r.officer_reply ? (
                    <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/60 p-2.5">
                      <p className="mb-0.5 flex items-center gap-1 text-[10px] font-bold uppercase text-blue-700">
                        <MessageSquare className="h-3 w-3" /> Officer reply
                      </p>
                      <p className="whitespace-pre-wrap text-sm text-slate-800">{r.officer_reply}</p>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
