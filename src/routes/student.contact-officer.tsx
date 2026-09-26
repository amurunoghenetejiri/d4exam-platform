import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  MoreVertical,
  Paperclip,
  Search,
  Send,
  Smile,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSessionUser } from "@/lib/session";
import { useStudentContext } from "@/lib/student";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isOnlineNow } from "@/lib/offline-sync";

export const Route = createFileRoute("/student/contact-officer")({
  head: () => ({
    meta: [
      { title: "Contact Officer — D4EXAM" },
      { name: "description", content: "Message your departmental examination officer." },
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

type TabKey = "inbox" | "sent" | "all";

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
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
  const { data: session } = useSessionUser();
  const { data: student } = useStudentContext();
  const qc = useQueryClient();
  const schoolId = session?.schoolId ?? student?.schoolId;
  const studentId = student?.studentId;

  const [tab, setTab] = useState<TabKey>("inbox");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  // compose form
  const [examSearch, setExamSearch] = useState("");
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const sendLock = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const examsQ = useQuery({
    queryKey: ["student-contact-exams", schoolId, studentId],
    enabled: Boolean(schoolId),
    staleTime: 60_000,
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
        if (!map.has(id)) map.set(id, String((e as { title?: string }).title || "Examination"));
      }
      return [...map.entries()].map(([id, title]) => ({ id, title }));
    },
  });

  const mineQ = useQuery({
    queryKey: ["student-my-reports", schoolId, studentId, session?.userId],
    enabled: Boolean(schoolId && (studentId || session?.userId)),
    refetchInterval: 12_000,
    queryFn: async () => {
      let q = supabase
        .from("student_officer_reports")
        .select(
          "id, exam_id, exam_title, exam_titles, subject, body, status, officer_reply, replied_at, created_at",
        )
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false })
        .limit(80);
      if (studentId) q = q.eq("student_id", studentId);
      else if (session?.userId) q = q.eq("student_user_id", session.userId);
      const { data, error } = await q;
      if (error) {
        console.warn("[student-messages]", error.message);
        return [] as ReportRow[];
      }
      return (data ?? []) as ReportRow[];
    },
  });

  const rows = mineQ.data ?? [];
  const exams = examsQ.data ?? [];

  const inboxCount = useMemo(
    () => rows.filter((r) => r.officer_reply && String(r.status || "").toLowerCase() !== "read").length,
    [rows],
  );

  const filtered = useMemo(() => {
    let list = rows;
    if (tab === "inbox") {
      list = rows.filter((r) => Boolean(r.officer_reply));
    } else if (tab === "sent") {
      list = rows;
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => {
      const hay = `${r.subject || ""} ${r.body || ""} ${r.officer_reply || ""} ${r.exam_title || ""} ${(r.exam_titles || []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, tab, search]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [selectedId, selected?.officer_reply, selected?.body]);

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
    setSelectedExamIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const submitNew = useCallback(async () => {
    if (sendLock.current) return;
    if (!schoolId || !body.trim()) {
      toast.error("Write a message before sending.");
      return;
    }
    if (!isOnlineNow()) {
      toast.error("Internet connection is required to send messages.");
      return;
    }
    sendLock.current = true;
    setSending(true);
    try {
      const name = session?.fullName || student?.fullName || "Student";
      const matric = student?.matric || null;
      const { error } = await supabase.from("student_officer_reports").insert({
        school_id: schoolId,
        student_id: studentId || null,
        student_user_id: session?.userId || null,
        student_name: name,
        student_matric: matric,
        exam_id: selectedExamIds[0] || null,
        exam_title: selectedTitles[0] || null,
        exam_ids: selectedExamIds.length ? selectedExamIds : [],
        exam_titles: selectedTitles.length ? selectedTitles : [],
        subject: subject.trim() || "Exam report",
        body: body.trim(),
        status: "open",
      } as never);
      if (error) throw error;
      toast.success("Message sent to your officer");
      setBody("");
      setSubject("");
      setSelectedExamIds([]);
      setComposeOpen(false);
      await qc.invalidateQueries({ queryKey: ["student-my-reports"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send");
    } finally {
      setSending(false);
      window.setTimeout(() => {
        sendLock.current = false;
      }, 400);
    }
  }, [
    schoolId,
    body,
    session?.fullName,
    session?.userId,
    student?.fullName,
    student?.matric,
    studentId,
    selectedExamIds,
    selectedTitles,
    subject,
    qc,
  ]);

  const sendFollowUp = useCallback(async () => {
    if (sendLock.current || !selected || !replyText.trim()) return;
    if (!isOnlineNow()) {
      toast.error("Internet connection is required to send messages.");
      return;
    }
    sendLock.current = true;
    setSending(true);
    try {
      const name = session?.fullName || student?.fullName || "Student";
      const { error } = await supabase.from("student_officer_reports").insert({
        school_id: schoolId,
        student_id: studentId || null,
        student_user_id: session?.userId || null,
        student_name: name,
        student_matric: student?.matric || null,
        exam_id: selected.exam_id,
        exam_title: selected.exam_title,
        exam_ids: selected.exam_id ? [selected.exam_id] : [],
        exam_titles: selected.exam_title ? [selected.exam_title] : [],
        subject: selected.subject || "Follow-up",
        body: replyText.trim(),
        status: "open",
      } as never);
      if (error) throw error;
      setReplyText("");
      toast.success("Message sent");
      await qc.invalidateQueries({ queryKey: ["student-my-reports"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send");
    } finally {
      setSending(false);
      window.setTimeout(() => {
        sendLock.current = false;
      }, 400);
    }
  }, [selected, replyText, schoolId, session, student, studentId, qc]);

  const showChat = Boolean(selectedId && selected);
  const showCompose = composeOpen;

  return (
    <div className="-mx-3 -mt-4 flex min-h-[calc(100dvh-8rem)] flex-col bg-slate-50 sm:-mx-6 sm:-mt-6 lg:min-h-[calc(100dvh-6rem)] lg:flex-row lg:overflow-hidden lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white lg:shadow-sm">
      {/* List pane */}
      <div
        className={cn(
          "flex min-h-0 flex-col border-slate-200 bg-white lg:w-[380px] lg:shrink-0 lg:border-r",
          (showChat || showCompose) && "hidden lg:flex",
        )}
      >
        <div className="shrink-0 border-b border-slate-100 px-4 pb-3 pt-4">
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Contact Officer</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Send a message to your departmental officer. They will respond as soon as possible.
          </p>
          <Button
            type="button"
            className="mt-3 h-11 w-full rounded-xl bg-[#2563eb] text-sm font-bold hover:bg-[#1d4ed8]"
            onClick={() => {
              setComposeOpen(true);
              setSelectedId(null);
            }}
          >
            + New Message
          </Button>

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
          {mineQ.isLoading ? (
            <li className="px-4 py-8 text-center text-sm text-slate-500">Loading messages…</li>
          ) : filtered.length === 0 ? (
            <li className="px-4 py-10 text-center text-sm text-slate-500">
              No messages yet. Tap <span className="font-semibold">New Message</span> to contact your officer.
            </li>
          ) : (
            filtered.map((r) => {
              const active = selectedId === r.id;
              const preview = r.officer_reply || r.body;
              const unread = Boolean(r.officer_reply) && String(r.status || "").toLowerCase() === "replied";
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(r.id);
                      setComposeOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3 text-left transition hover:bg-slate-50",
                      active && "bg-blue-50/80",
                    )}
                  >
                    <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#0b1b3a] text-white">
                      <User className="h-5 w-5" />
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-bold text-slate-900">Departmental Officer</p>
                        <span className="shrink-0 text-[10px] text-slate-400">{formatWhen(r.created_at)}</span>
                      </div>
                      <p className="truncate text-xs font-medium text-slate-600">{r.subject || "Message"}</p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{preview}</p>
                      <p className="mt-0.5 text-[10px] font-medium text-emerald-600">● Online</p>
                    </div>
                    {unread ? (
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

      {/* Chat / compose pane */}
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col bg-slate-50 lg:bg-[#f8fafc]",
          !showChat && !showCompose && "hidden lg:flex",
        )}
      >
        {showCompose ? (
          <ComposePanel
            onBack={() => setComposeOpen(false)}
            examSearch={examSearch}
            setExamSearch={setExamSearch}
            filteredExams={filteredExams}
            selectedExamIds={selectedExamIds}
            toggleExam={toggleExam}
            pickerOpen={pickerOpen}
            setPickerOpen={setPickerOpen}
            selectedTitles={selectedTitles}
            setSelectedExamIds={setSelectedExamIds}
            subject={subject}
            setSubject={setSubject}
            body={body}
            setBody={setBody}
            sending={sending}
            onSend={() => void submitNew()}
          />
        ) : showChat && selected ? (
          <>
            <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 py-3">
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-full text-slate-600 hover:bg-slate-100 lg:hidden"
                onClick={() => setSelectedId(null)}
                aria-label="Back to messages"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <span className="relative grid h-10 w-10 place-items-center rounded-full bg-[#0b1b3a] text-white">
                <User className="h-5 w-5" />
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-900">Departmental Officer</p>
                <p className="text-[11px] font-medium text-emerald-600">Online</p>
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
              {/* Student outgoing */}
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#2563eb] px-3.5 py-2.5 text-white shadow-sm">
                  {selected.subject ? (
                    <p className="mb-1 text-[11px] font-semibold text-blue-100">{selected.subject}</p>
                  ) : null}
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{selected.body}</p>
                  <p className="mt-1 text-right text-[10px] text-blue-100">
                    {formatTime(selected.created_at)} ✓
                  </p>
                </div>
              </div>
              {selected.officer_reply ? (
                <div className="flex justify-start gap-2">
                  <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#0b1b3a] text-white">
                    <User className="h-3.5 w-3.5" />
                  </span>
                  <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-slate-100 bg-white px-3.5 py-2.5 shadow-sm">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                      {selected.officer_reply}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {selected.replied_at ? formatTime(selected.replied_at) : ""}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-center text-xs text-slate-400">Waiting for officer reply…</p>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="shrink-0 border-t border-slate-200 bg-white px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <div className="flex items-end gap-2">
                <button type="button" className="mb-1 grid h-9 w-9 place-items-center rounded-full text-slate-400" aria-label="Attach" disabled>
                  <Paperclip className="h-5 w-5" />
                </button>
                <div className="flex min-w-0 flex-1 items-end rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={1}
                    placeholder="Type your message…"
                    className="max-h-24 min-h-[36px] w-full resize-none bg-transparent py-2 text-sm outline-none"
                  />
                  <button type="button" className="mb-1 text-slate-400" aria-label="Emoji" disabled>
                    <Smile className="h-5 w-5" />
                  </button>
                </div>
                <button
                  type="button"
                  disabled={sending || !replyText.trim()}
                  onClick={() => void sendFollowUp()}
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
              Choose a message from the list, or start a new one with your departmental officer.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ComposePanel({
  onBack,
  examSearch,
  setExamSearch,
  filteredExams,
  selectedExamIds,
  toggleExam,
  pickerOpen,
  setPickerOpen,
  selectedTitles,
  setSelectedExamIds,
  subject,
  setSubject,
  body,
  setBody,
  sending,
  onSend,
}: {
  onBack: () => void;
  examSearch: string;
  setExamSearch: (v: string) => void;
  filteredExams: ExamOpt[];
  selectedExamIds: string[];
  toggleExam: (id: string) => void;
  pickerOpen: boolean;
  setPickerOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  selectedTitles: string[];
  setSelectedExamIds: (v: string[]) => void;
  subject: string;
  setSubject: (v: string) => void;
  body: string;
  setBody: (v: string) => void;
  sending: boolean;
  onSend: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-3 py-3">
        <button
          type="button"
          onClick={onBack}
          className="grid h-9 w-9 place-items-center rounded-full hover:bg-slate-100"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5 text-slate-700" />
        </button>
        <h2 className="text-base font-extrabold text-slate-900">New Message</h2>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
            Examination(s)
          </label>
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-left text-sm font-medium text-slate-800"
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
            <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 shadow-lg">
              <div className="border-b border-slate-100 p-2">
                <Input
                  value={examSearch}
                  onChange={(e) => setExamSearch(e.target.value)}
                  placeholder="Search examinations…"
                  className="h-9 border-0 bg-slate-50 text-sm shadow-none"
                  autoFocus
                />
              </div>
              <ul className="max-h-44 overflow-y-auto p-1">
                {filteredExams.map((e) => {
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
                            "grid h-5 w-5 place-items-center rounded border",
                            on ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300",
                          )}
                        >
                          {on ? <Check className="h-3 w-3" /> : null}
                        </span>
                        <span className="truncate">{e.title}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="flex justify-between border-t border-slate-100 px-3 py-2">
                <button type="button" className="text-xs font-semibold text-slate-500" onClick={() => setSelectedExamIds([])}>
                  Clear
                </button>
                <Button type="button" size="sm" className="h-8" onClick={() => setPickerOpen(false)}>
                  Done
                </Button>
              </div>
            </div>
          ) : null}
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Subject</label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Timer froze during CBT"
            className="h-11 rounded-xl"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Your message</label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Describe what happened and how we can help…"
            className="min-h-[140px] rounded-xl text-sm"
          />
        </div>
      </div>
      <div className="shrink-0 border-t border-slate-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button
          type="button"
          className="h-12 w-full rounded-xl bg-[#2563eb] text-sm font-bold hover:bg-[#1d4ed8]"
          disabled={sending || !body.trim()}
          onClick={onSend}
        >
          <Send className="mr-2 h-4 w-4" />
          Send to officer
        </Button>
      </div>
    </div>
  );
}
