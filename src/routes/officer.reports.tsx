import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Search, Send } from "lucide-react";
import { PageHeader, SectionCard, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/officer/reports")({
  head: () => ({
    meta: [
      { title: "Student reports — D4EXAM" },
      { name: "description", content: "Messages and exam reports from students to the departmental officer." },
    ],
  }),
  component: Page,
});

type ReportRow = {
  id: string;
  school_id: string;
  student_id: string | null;
  student_user_id: string | null;
  student_name: string | null;
  student_matric: string | null;
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
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId;
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [examFilter, setExamFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const listQ = useQuery({
    queryKey: ["officer-student-reports", schoolId],
    enabled: Boolean(schoolId),
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!schoolId) return [] as ReportRow[];
      const { data, error } = await supabase
        .from("student_officer_reports")
        .select(
          "id, school_id, student_id, student_user_id, student_name, student_matric, exam_id, exam_title, subject, body, status, officer_reply, replied_at, created_at",
        )
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        console.warn("[officer-reports]", error.message);
        throw error;
      }
      return (data ?? []) as ReportRow[];
    },
  });

  const rows = listQ.data ?? [];
  const examOptions = useMemo(() => {
    const set = new Map<string, string>();
    for (const r of rows) {
      if (r.exam_id && r.exam_title) set.set(r.exam_id, r.exam_title);
    }
    return [...set.entries()];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (examFilter && r.exam_id !== examFilter) return false;
      if (!q) return true;
      const hay = `${r.student_name || ""} ${r.student_matric || ""} ${r.exam_title || ""} ${r.subject || ""} ${r.body || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, examFilter]);

  const selected = filtered.find((r) => r.id === selectedId) ?? rows.find((r) => r.id === selectedId) ?? null;

  async function sendReply() {
    if (!selected || !reply.trim() || !user?.userId) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("student_officer_reports")
        .update({
          officer_reply: reply.trim(),
          replied_at: new Date().toISOString(),
          status: "replied",
          officer_user_id: user.userId,
        })
        .eq("id", selected.id);
      if (error) throw error;
      // Notify student if we have user id
      if (selected.student_user_id) {
        try {
          await supabase.from("notifications").insert({
            recipient_user_id: selected.student_user_id,
            school_id: schoolId,
            title: "Officer replied to your report",
            message: reply.trim().slice(0, 280),
            type: "info",
            entity_type: "student_officer_report",
            entity_id: selected.id,
            link: "/student/contact-officer",
          } as never);
        } catch {
          /* optional */
        }
      }
      toast.success("Reply sent to student");
      setReply("");
      await qc.invalidateQueries({ queryKey: ["officer-student-reports"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send reply");
    } finally {
      setBusy(false);
    }
  }

  const tableMissing =
    listQ.isError &&
    /relation|does not exist|schema cache/i.test(String((listQ.error as Error)?.message || ""));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Student reports"
        description="Exam issues and messages from students. Search by name, matric, or exam — then reply."
      />

      {tableMissing ? (
        <SectionCard title="Database setup required">
          <p className="text-sm text-slate-600">
            Run the <code className="rounded bg-slate-100 px-1">student_officer_reports</code> SQL in
            Supabase (see migration file) so students can send reports and you can reply here.
          </p>
        </SectionCard>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, matric, exam, message…"
            className="h-10 pl-9"
          />
        </div>
        <select
          value={examFilter}
          onChange={(e) => setExamFilter(e.target.value)}
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
        >
          <option value="">All examinations</option>
          {examOptions.map(([id, title]) => (
            <option key={id} value={id}>
              {title}
            </option>
          ))}
        </select>
      </div>

      <div
        className="flex flex-col gap-3 lg:flex-row lg:gap-0"
        style={{ minHeight: "clamp(18rem, 55vh, 40rem)" }}
      >
        <div className="min-w-0 flex-1 lg:max-w-[42%]">
          <SectionCard
            title="Inbox"
            description={listQ.isFetching ? "Refreshing…" : `${filtered.length} report(s)`}
            className="flex h-full min-h-0 flex-col overflow-hidden"
            bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0 sm:p-0"
          >
            {listQ.isLoading ? (
              <p className="p-3 text-sm text-slate-500">Loading reports…</p>
            ) : filtered.length === 0 ? (
              <EmptyState
                title="No student reports yet"
                description="When students use Contact officer, their messages appear here."
              />
            ) : (
              <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
                {filtered.map((r) => {
                  const open = selectedId === r.id;
                  const st = String(r.status || "open").toLowerCase();
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(r.id);
                          setReply(r.officer_reply || "");
                        }}
                        className={cn(
                          "w-full px-3 py-3 text-left transition-colors hover:bg-slate-50",
                          open && "bg-blue-50/80",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-900">
                              {r.student_name || "Student"}
                              {r.student_matric ? (
                                <span className="ml-1.5 text-xs font-semibold text-slate-500">
                                  · {r.student_matric}
                                </span>
                              ) : null}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {r.exam_title || "General"} · {r.subject || "Report"}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                              st === "replied"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-amber-50 text-amber-800",
                            )}
                          >
                            {st}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-600">{r.body}</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="hidden w-3 shrink-0 items-center justify-center lg:flex">
          <div className="h-14 w-[3px] rounded-full bg-blue-500/80" />
        </div>

        <div className="min-w-0 flex-1">
          <SectionCard
            title="Conversation"
            className="flex h-full min-h-0 flex-col overflow-hidden"
            bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            {!selected ? (
              <EmptyState
                title="Select a report"
                description="Choose a student message on the left to read and reply."
              />
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <div className="shrink-0 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                  <p className="text-sm font-bold text-slate-900">
                    {selected.student_name || "Student"}
                    {selected.student_matric ? ` · ${selected.student_matric}` : ""}
                  </p>
                  <p className="text-xs text-slate-500">
                    {selected.exam_title || "General"} ·{" "}
                    {new Date(selected.created_at).toLocaleString()}
                  </p>
                  {selected.subject ? (
                    <p className="mt-1 text-xs font-semibold text-slate-700">{selected.subject}</p>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      <MessageSquare className="h-3 w-3" /> Student
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-slate-800">{selected.body}</p>
                  </div>
                  {selected.officer_reply ? (
                    <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-blue-600">
                        Your reply
                        {selected.replied_at
                          ? ` · ${new Date(selected.replied_at).toLocaleString()}`
                          : ""}
                      </p>
                      <p className="whitespace-pre-wrap text-sm text-slate-800">
                        {selected.officer_reply}
                      </p>
                    </div>
                  ) : null}
                </div>
                <div className="shrink-0 space-y-2 border-t border-slate-100 pt-2">
                  <Textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Write a reply to this student…"
                    className="min-h-[88px] text-sm"
                  />
                  <Button
                    type="button"
                    className="font-semibold"
                    disabled={busy || !reply.trim()}
                    onClick={() => void sendReply()}
                  >
                    <Send className="mr-1.5 h-4 w-4" />
                    Send reply
                  </Button>
                </div>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
