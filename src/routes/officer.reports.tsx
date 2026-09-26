import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MoreVertical, Paperclip, Search, Send, Smile, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isOnlineNow } from "@/lib/offline-sync";

export const Route = createFileRoute("/officer/reports")({
  head: () => ({
    meta: [
      { title: "Messages — D4EXAM" },
      { name: "description", content: "View and reply to messages from your students." },
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

type TabKey = "inbox" | "sent" | "all";

const AVATAR_COLORS = [
  "bg-blue-600",
  "bg-violet-600",
  "bg-emerald-600",
  "bg-rose-500",
  "bg-amber-600",
  "bg-cyan-600",
];

function avatarColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * 17) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

function initials(name: string | null) {
  const p = (name || "S").trim().split(/\s+/);
  if (p.length >= 2) return (p[0][0] + p[1][0]).toUpperCase();
  return (p[0]?.[0] || "S").toUpperCase();
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return "Yesterday";
  }
  return d.toLocaleDateString([], { weekday: "short" });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Page() {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId;
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("inbox");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const sendLock = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

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
        console.warn("[officer-messages]", error.message);
        return [] as ReportRow[];
      }
      return (data ?? []) as ReportRow[];
    },
  });

  const rows = listQ.data ?? [];
  const inboxCount = useMemo(
    () => rows.filter((r) => String(r.status || "open").toLowerCase() !== "replied").length,
    [rows],
  );

  const filtered = useMemo(() => {
    let list = rows;
    if (tab === "inbox") {
      list = rows.filter((r) => String(r.status || "open").toLowerCase() !== "replied");
    } else if (tab === "sent") {
      list = rows.filter((r) => Boolean(r.officer_reply));
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => {
      const hay = `${r.student_name || ""} ${r.student_matric || ""} ${r.subject || ""} ${r.body || ""} ${r.exam_title || ""} ${(r.exam_titles || []).join(" ")} ${r.officer_reply || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, tab, search]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [selectedId, selected?.officer_reply, selected?.body]);

  const sendReply = useCallback(async () => {
    if (sendLock.current || !selected || !reply.trim() || !user?.userId) return;
    if (!isOnlineNow()) {
      toast.error("Internet connection is required to send messages.");
      return;
    }
    sendLock.current = true;
    setSending(true);
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
            title: "Officer replied to your message",
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
      await qc.invalidateQueries({ queryKey: ["nav-student-reports-open"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send reply");
    } finally {
      setSending(false);
      window.setTimeout(() => {
        sendLock.current = false;
      }, 400);
    }
  }, [selected, reply, user?.userId, schoolId, qc]);

  const showChat = Boolean(selectedId && selected);

  return (
    <div className="-mx-3 -mt-4 flex min-h-[calc(100dvh-8rem)] flex-col bg-slate-50 sm:-mx-6 sm:-mt-6 lg:min-h-[calc(100dvh-6rem)] lg:flex-row lg:overflow-hidden lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white lg:shadow-sm">
      {/* List */}
      <div
        className={cn(
          "flex min-h-0 flex-col border-slate-200 bg-white lg:w-[380px] lg:shrink-0 lg:border-r",
          showChat && "hidden lg:flex",
        )}
      >
        <div className="shrink-0 border-b border-slate-100 px-4 pb-3 pt-4">
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Messages</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            View and reply to messages from your students and other users.
          </p>

          <div className="mt-3 flex gap-1 rounded-full bg-slate-100 p-1">
            {(
              [
                { k: "inbox" as const, label: "Inbox", count: inboxCount },
                { k: "sent" as const, label: "Sent" },
                { k: "all" as const, label: "All" },
              ] as const
            ).map((t) => (
              <button
                key={t.k}
                type="button"
                onClick={() => setTab(t.k)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1 rounded-full py-2 text-xs font-bold transition",
                  tab === t.k ? "bg-[#2563eb] text-white shadow-sm" : "text-slate-600 hover:bg-white",
                )}
              >
                {t.label}
                {"count" in t && t.count > 0 ? (
                  <span
                    className={cn(
                      "grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px]",
                      tab === t.k ? "bg-white/25 text-white" : "bg-red-500 text-white",
                    )}
                  >
                    {t.count}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search messages…"
              className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9 text-sm"
            />
          </div>
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {listQ.isLoading ? (
            <li className="px-4 py-8 text-center text-sm text-slate-500">Loading…</li>
          ) : filtered.length === 0 ? (
            <li className="px-4 py-10 text-center text-sm text-slate-500">No student messages yet.</li>
          ) : (
            filtered.map((r) => {
              const active = selectedId === r.id;
              const open = String(r.status || "open").toLowerCase() !== "replied";
              const seed = r.student_id || r.student_name || r.id;
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
                      "flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3 text-left transition hover:bg-slate-50",
                      active && "bg-blue-50/80",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold text-white",
                        avatarColor(seed),
                      )}
                    >
                      {initials(r.student_name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-bold text-slate-900">
                          {r.student_name || "Student"}
                        </p>
                        <span className="shrink-0 text-[10px] text-slate-400">{formatWhen(r.created_at)}</span>
                      </div>
                      <p className="truncate text-xs font-medium text-slate-600">
                        {r.subject || titles}
                        {r.student_matric ? ` · ${r.student_matric}` : ""}
                      </p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{r.body}</p>
                    </div>
                    {open ? (
                      <span className="mt-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                        1
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>

      {/* Chat */}
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col bg-[#f8fafc]",
          !showChat && "hidden lg:flex",
        )}
      >
        {showChat && selected ? (
          <>
            <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 py-3">
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-full text-slate-600 hover:bg-slate-100 lg:hidden"
                onClick={() => setSelectedId(null)}
                aria-label="Back"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <span
                className={cn(
                  "grid h-10 w-10 place-items-center rounded-full text-sm font-bold text-white",
                  avatarColor(selected.student_id || selected.student_name || selected.id),
                )}
              >
                {initials(selected.student_name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-900">
                  {selected.student_name || "Student"}
                  {selected.student_matric ? (
                    <span className="ml-1.5 text-xs font-semibold text-slate-500">
                      · {selected.student_matric}
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-[11px] text-slate-500">
                  {(selected.exam_titles && selected.exam_titles.length
                    ? selected.exam_titles.join(" · ")
                    : null) ||
                    selected.exam_title ||
                    "General"}
                </p>
              </div>
              <button type="button" className="grid h-9 w-9 place-items-center rounded-full text-slate-400" aria-label="More">
                <MoreVertical className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5">
              <p className="text-center text-[11px] font-medium text-slate-400">
                {new Date(selected.created_at).toLocaleDateString(undefined, {
                  weekday: "long",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
              {/* Student message — incoming for officer */}
              <div className="flex justify-start gap-2">
                <span
                  className={cn(
                    "mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white",
                    avatarColor(selected.student_id || selected.student_name || selected.id),
                  )}
                >
                  {initials(selected.student_name)}
                </span>
                <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-slate-100 bg-white px-3.5 py-2.5 shadow-sm">
                  {selected.subject ? (
                    <p className="mb-1 text-[11px] font-semibold text-slate-500">{selected.subject}</p>
                  ) : null}
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{selected.body}</p>
                  <p className="mt-1 text-[10px] text-slate-400">{formatTime(selected.created_at)}</p>
                </div>
              </div>
              {selected.officer_reply ? (
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#2563eb] px-3.5 py-2.5 text-white shadow-sm">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{selected.officer_reply}</p>
                    <p className="mt-1 text-right text-[10px] text-blue-100">
                      {selected.replied_at ? formatTime(selected.replied_at) : ""} ✓
                    </p>
                  </div>
                </div>
              ) : null}
              <div ref={chatEndRef} />
            </div>

            <div className="shrink-0 border-t border-slate-200 bg-white px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <div className="flex items-end gap-2">
                <button type="button" className="mb-1 grid h-9 w-9 place-items-center rounded-full text-slate-400" disabled aria-label="Attach">
                  <Paperclip className="h-5 w-5" />
                </button>
                <div className="flex min-w-0 flex-1 items-end rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={1}
                    placeholder="Type your message…"
                    className="max-h-28 min-h-[36px] w-full resize-none bg-transparent py-2 text-sm outline-none"
                  />
                  <button type="button" className="mb-1 text-slate-400" disabled aria-label="Emoji">
                    <Smile className="h-5 w-5" />
                  </button>
                </div>
                <button
                  type="button"
                  disabled={sending || !reply.trim()}
                  onClick={() => void sendReply()}
                  className="mb-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#2563eb] text-white shadow-md disabled:opacity-40"
                  aria-label="Send"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="hidden flex-1 flex-col items-center justify-center gap-2 p-8 text-center lg:flex">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-slate-100 text-slate-400">
              <User className="h-8 w-8" />
            </span>
            <p className="text-sm font-semibold text-slate-700">Select a conversation</p>
            <p className="max-w-xs text-xs text-slate-500">
              Choose a student message from the inbox to read and reply.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
