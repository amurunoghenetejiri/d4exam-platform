import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, MessageSquare, Search, Send, GraduationCap } from "lucide-react";
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
      {
        name: "description",
        content: "Send exam issues and messages to your departmental examination officer.",
      },
    ],
  }),
  component: Page,
});

type ExamOpt = { id: string; title: string };
type ReportRow = {
  id: string;
  exam_id: string | null;
  exam_title: string | null;
  exam_titles?: string[] | null;
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
  const [examSearch, setExamSearch] = useState("");
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const examsQ = useQuery({
    queryKey: ["student-contact-exams", schoolId, studentId],
    enabled: Boolean(schoolId),
    queryFn: async () => {
      if (!schoolId) return [] as ExamOpt[];
      const map = new Map<string, string>();
      if (studentId) {
        const { data } = await supabase
          .from("exam_attempts")
          .select("exam_id, examinations(id, title)")
          .eq("student_id", studentId)
          .order("created_at", { ascending: false })
          .limit(60);
        for (const a of data ?? []) {
          const ex = (a as { examinations?: { id?: string; title?: string } | null }).examinations;
          const id = ex?.id || (a as { exam_id?: string }).exam_id;
          if (id) map.set(String(id), String(ex?.title || "Examination"));
        }
      }
      const { data: exams } = await supabase
        .from("examinations")
        .select("id, title")
        .eq("school_id", schoolId)
        .in("status", ["published", "approved", "scheduled", "active", "closed", "ongoing", "completed"])
        .order("created_at", { ascending: false })
        .limit(80);
      for (const e of exams ?? []) {
        const id = String((e as { id: string }).id);
        if (!map.has(id)) {
          map.set(id, String((e as { title?: string }).title || "Examination"));
        }
      }
      return [...map.entries()].map(([id, title]) => ({ id, title }));
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
          "id, exam_id, exam_title, exam_titles, subject, body, status, officer_reply, replied_at, created_at",
        )
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (studentId) q = q.eq("student_id", studentId);
      else if (session?.userId) q = q.eq("student_user_id", session.userId);
      const { data, error } = await q;
      if (error) {
        console.warn("[student-reports]", error.message);
        return [] as ReportRow[];
      }
      return (data ?? []) as ReportRow[];
    },
  });

  const exams = examsQ.data ?? [];
  const filteredExams = useMemo(() => {
    const q = examSearch.trim().toLowerCase();
    if (!q) return exams;
    return exams.filter((e) => e.title.toLowerCase().includes(q));
  }, [exams, examSearch]);

  const selectedTitles = useMemo(
    () => exams.filter((e) => selectedExamIds.includes(e.id)).map((e) => e.title),
    [exams, selectedExamIds],
  );

  function toggleExam(id: string) {
    setSelectedExamIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function submit() {
    if (!schoolId || !body.trim()) {
      toast.error("Write a short message about the issue.");
      return;
    }
    setBusy(true);
    try {
      const name = session?.fullName || student?.fullName || "Student";
      const matric = student?.matric || null;
      const primaryId = selectedExamIds[0] || null;
      const primaryTitle = selectedTitles[0] || null;
      const { error } = await supabase.from("student_officer_reports").insert({
        school_id: schoolId,
        student_id: studentId || null,
        student_user_id: session?.userId || null,
        student_name: name,
        student_matric: matric,
        exam_id: primaryId,
        exam_title: primaryTitle,
        exam_ids: selectedExamIds.length ? selectedExamIds : [],
        exam_titles: selectedTitles.length ? selectedTitles : [],
        subject: subject.trim() || "Exam report",
        body: body.trim(),
        status: "open",
      } as never);
      if (error) throw error;
      toast.success("Report sent to your examination officer");
      setBody("");
      setSubject("");
      setSelectedExamIds([]);
      await qc.invalidateQueries({ queryKey: ["student-my-reports"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send");
    } finally {
      setBusy(false);
    }
  }

  const mine = mineQ.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Contact officer"
        description="Tell your departmental examination officer about an exam issue. They can reply here."
      />

      <div className="overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white shadow-sm">
            <GraduationCap className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-bold text-slate-900">New message</p>
            <p className="text-xs text-slate-500">Choose exam(s), describe the issue, send.</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
              Examination(s)
            </label>
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-left text-sm font-medium text-slate-800 shadow-sm"
            >
              <span className="truncate">
                {selectedTitles.length
                  ? selectedTitles.length === 1
                    ? selectedTitles[0]
                    : `${selectedTitles.length} exams selected`
                  : "Select examination(s)…"}
              </span>
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
            {pickerOpen ? (
              <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                <div className="border-b border-slate-100 p-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={examSearch}
                      onChange={(e) => setExamSearch(e.target.value)}
                      placeholder="Search examinations…"
                      className="h-9 border-0 bg-slate-50 pl-8 text-sm shadow-none focus-visible:ring-1"
                      autoFocus
                    />
                  </div>
                </div>
                <ul className="max-h-52 overflow-y-auto overscroll-contain p-1">
                  {filteredExams.length === 0 ? (
                    <li className="px-3 py-4 text-center text-xs text-slate-500">No exams found</li>
                  ) : (
                    filteredExams.map((e) => {
                      const on = selectedExamIds.includes(e.id);
                      return (
                        <li key={e.id}>
                          <button
                            type="button"
                            onClick={() => toggleExam(e.id)}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm",
                              on ? "bg-blue-50 text-blue-900" : "hover:bg-slate-50",
                            )}
                          >
                            <span
                              className={cn(
                                "grid h-5 w-5 shrink-0 place-items-center rounded border",
                                on
                                  ? "border-blue-600 bg-blue-600 text-white"
                                  : "border-slate-300 bg-white",
                              )}
                            >
                              {on ? <Check className="h-3 w-3" /> : null}
                            </span>
                            <span className="truncate font-medium">{e.title}</span>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
                <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2">
                  <button
                    type="button"
                    className="text-xs font-semibold text-slate-500"
                    onClick={() => setSelectedExamIds([])}
                  >
                    Clear
                  </button>
                  <Button type="button" size="sm" className="h-8" onClick={() => setPickerOpen(false)}>
                    Done
                  </Button>
                </div>
              </div>
            ) : null}
            {selectedTitles.length > 1 ? (
              <p className="mt-1.5 text-[11px] text-slate-500">{selectedTitles.join(" · ")}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
              Subject
            </label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Timer froze during CBT"
              className="h-11 rounded-xl"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
              Your message
            </label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Describe what happened and how we can help…"
              className="min-h-[130px] rounded-xl text-sm"
            />
          </div>
          <Button
            type="button"
            className="h-11 w-full rounded-xl font-bold sm:w-auto"
            disabled={busy}
            onClick={() => void submit()}
          >
            <Send className="mr-1.5 h-4 w-4" />
            Send to officer
          </Button>
        </div>
      </div>

      <SectionCard title="Your conversation history">
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
              const titles =
                (r.exam_titles && r.exam_titles.length ? r.exam_titles.join(" · ") : null) ||
                r.exam_title ||
                "General";
              return (
                <li
                  key={r.id}
                  className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{r.subject || "Report"}</p>
                      <p className="truncate text-xs text-slate-500">{titles}</p>
                      <p className="text-[11px] text-slate-400">
                        {new Date(r.created_at).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase",
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
                    <div className="mt-3 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-3">
                      <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-blue-700">
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
