import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, MessageSquare, Search, Send, Sparkles } from "lucide-react";
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
      {
        name: "description",
        content: "Messages and exam reports from students to the departmental officer.",
      },
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
  exam_titles?: string[] | null;
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
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "replied">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const listQ = useQuery({
    queryKey: ["officer-student-reports", schoolId],
    enabled: Boolean(schoolId),
    refetchInterval: 12_000,
    queryFn: async () => {
      if (!schoolId) return [] as ReportRow[];
      const { data, error } = await supabase
        .from("student_officer_reports")
        .select(
          "id, school_id, student_id, student_user_id, student_name, student_matric, exam_id, exam_title, exam_titles, subject, body, status, officer_reply, replied_at, created_at",
        )
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        console.warn("[officer-reports]", error.message);
        return [] as ReportRow[];
      }
      return (data ?? []) as ReportRow[];
    },
  });

  const rows = listQ.data ?? [];
  const openCount = rows.filter((r) => String(r.status || "open").toLowerCase() !== "replied").length;
  const repliedCount = rows.length - openCount;

  const examOptions = useMemo(() => {
    const set = new Map<string, string>();
    for (const r of rows) {
      if (r.exam_id && r.exam_title) set.set(r.exam_id, r.exam_title);
      for (let i = 0; i < (r.exam_titles?.length || 0); i++) {
        const t = r.exam_titles![i];
        if (t) set.set(`t:${t}`, t);
      }
    }
    return [...set.entries()];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const st = String(r.status || "open").toLowerCase();
      if (statusFilter === "open" && st === "replied") return false;
      if (statusFilter === "replied" && st !== "replied") return false;
      if (examFilter) {
        if (examFilter.startsWith("t:")) {
          const title = examFilter.slice(2);
          const titles = r.exam_titles || [];
          if (r.exam_title !== title && !titles.includes(title)) return false;
        } else if (r.exam_id !== examFilter) return false;
      }
      if (!q) return true;
      const hay = `${r.student_name || ""} ${r.student_matric || ""} ${r.exam_title || ""} ${(r.exam_titles || []).join(" ")} ${r.subject || ""} ${r.body || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, examFilter, statusFilter]);

  const selected =
    filtered.find((r) => r.id === selectedId) ?? rows.find((r) => r.id === selectedId) ?? null;

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
          updated_at: new Date().toISOString(),
        })
        .eq("id", selected.id);
      if (error) throw error;
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
      toast.success("Reply sent");
      setReply("");
      await qc.invalidateQueries({ queryKey: ["officer-student-reports"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send reply");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Student reports"
        description="Inbox for exam issues and messages from students. Search, filter, and reply."
      />

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Total</p>
          <p className="mt-0.5 text-xl font-extrabold text-slate-900">{rows.length}</p>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-3 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Open</p>
          <p className="mt-0.5 text-xl font-extrabold text-amber-900">{openCount}</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Replied</p>
          <p className="mt-0.5 text-xl font-extrabold text-emerald-900">{repliedCount}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-0 flex-1 sm:min-w-[12rem]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, matric, exam, message…"
            className="h-10 rounded-xl pl-9"
          />
        </div>
        <select
          value={examFilter}
          onChange={(e) => setExamFilter(e.target.value)}
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
        >
          <option value="">All examinations</option>
          {examOptions.map(([id, title]) => (
            <option key={id} value={id}>
              {title}
            </option>
          ))}
        </select>
        <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
          {(["all", "open", "replied"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded-lg px-2.5 py-1.5 text-xs font-bold capitalize",
                statusFilter === s ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div
        className="flex flex-col gap-4 lg:flex-row lg:gap-0 lg:items-stretch"
        className="min-h-[32rem] lg:h-[min(44rem,70vh)]"
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:max-w-[42%]">
          <SectionCard
            title="Inbox"
            description={`${filtered.length} message(s)`}
            className="flex h-full min-h-0 flex-col overflow-hidden"
            bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden !p-0"
          >
            {listQ.isLoading ? (
              <p className="p-4 text-sm text-slate-500">Loading…</p>
            ) : filtered.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="Inbox is clear"
                  description="When students use Contact officer, messages appear here."
                />
              </div>
            ) : (
              <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto overscroll-contain">
                {filtered.map((r) => {
                  const open = selectedId === r.id;
                  const st = String(r.status || "open").toLowerCase();
                  const titles =
                    (r.exam_titles && r.exam_titles.length ? r.exam_titles.join(" · ") : null) ||
                    r.exam_title ||
                    "General";
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(r.id);
                          setReply(r.officer_reply || "");
                        }}
                        className={cn(
                          "w-full px-3.5 py-3 text-left transition-colors hover:bg-slate-50",
                          open && "bg-blue-50/90",
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
                              {titles} · {r.subject || "Report"}
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

        <div className="hidden w-5 shrink-0 items-center justify-center lg:flex">
          <div className="h-20 w-[3px] rounded-full bg-blue-500/80" />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <SectionCard
            title="Reply"
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
                <div className="shrink-0 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-3.5">
                  <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white">
                      <Inbox className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">
                        {selected.student_name || "Student"}
                        {selected.student_matric ? ` · ${selected.student_matric}` : ""}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {(selected.exam_titles && selected.exam_titles.length
                          ? selected.exam_titles.join(" · ")
                          : null) ||
                          selected.exam_title ||
                          "General"}{" "}
                        · {new Date(selected.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  {selected.subject ? (
                    <p className="mt-2 text-xs font-semibold text-slate-700">{selected.subject}</p>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      <MessageSquare className="h-3 w-3" /> Student
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-slate-800">{selected.body}</p>
                  </div>
                  {selected.officer_reply ? (
                    <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3">
                      <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                        <Sparkles className="h-3 w-3" /> Your reply
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
                <div className="mt-auto shrink-0 space-y-2 border-t border-slate-100 bg-white pt-3">
                  <Textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Write a clear reply to this student…"
                    className="min-h-[140px] rounded-xl text-sm sm:min-h-[160px]"
                  />
                  <Button
                    type="button"
                    className="h-10 w-full rounded-xl font-bold sm:w-auto"
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
