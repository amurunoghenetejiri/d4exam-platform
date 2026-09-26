import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Mic,
  Paperclip,
  Search,
  Send,
  User,
  X,
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
import { joinMessagingPresence, ticksFor } from "@/lib/messaging-presence";

export const Route = createFileRoute("/student/contact-officer")({
  head: () => ({
    meta: [{ title: "Messages — D4EXAM" }],
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
  officer_read_at?: string | null;
  student_read_at?: string | null;
  attachment_url?: string | null;
  attachment_type?: string | null;
  reply_to_id?: string | null;
};

type TabKey = "inbox" | "sent" | "all";
type ChatMsg = {
  key: string;
  side: "out" | "in";
  text: string;
  at: string;
  subject?: string | null;
  attachment_url?: string | null;
  attachment_type?: string | null;
  reportId: string;
};

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short" });
}
function formatTime(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Ticks({ state }: { state: "none" | "sent" | "delivered" | "read" }) {
  if (state === "none") return null;
  if (state === "sent") return <Check className="inline h-3.5 w-3.5 text-blue-100" aria-label="Sent" />;
  if (state === "delivered")
    return <CheckCheck className="inline h-3.5 w-3.5 text-blue-100" aria-label="Delivered" />;
  return <CheckCheck className="inline h-3.5 w-3.5 text-[#0b1b3a]" aria-label="Read" />;
}

function Page() {
  const navigate = useNavigate();
  const { data: session } = useSessionUser();
  const { data: student } = useStudentContext();
  const qc = useQueryClient();
  const schoolId = session?.schoolId ?? student?.schoolId;
  const studentId = student?.studentId;
  const userId = session?.userId;

  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [inChat, setInChat] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [officerOnline, setOfficerOnline] = useState(false);
  const [officerTyping, setOfficerTyping] = useState(false);
  const [officerRecording, setOfficerRecording] = useState(false);
  const [peerReadAt, setPeerReadAt] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const mediaRec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const presenceApi = useRef<ReturnType<typeof joinMessagingPresence> | null>(null);
  const sendLock = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [examSearch, setExamSearch] = useState("");
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pendingAttach, setPendingAttach] = useState<{ url: string; type: string } | null>(null);

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
    queryKey: ["student-my-reports", schoolId, studentId, userId],
    enabled: Boolean(schoolId && (studentId || userId)),
    refetchInterval: 8_000,
    queryFn: async () => {
      let q = supabase
        .from("student_officer_reports")
        .select(
          "id, exam_id, exam_title, exam_titles, subject, body, status, officer_reply, replied_at, created_at, officer_read_at, student_read_at, attachment_url, attachment_type, reply_to_id",
        )
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: true })
        .limit(200);
      if (studentId) q = q.eq("student_id", studentId);
      else if (userId) q = q.eq("student_user_id", userId);
      const { data, error } = await q;
      if (error) {
        // fallback without new columns
        let q2 = supabase
          .from("student_officer_reports")
          .select("id, exam_id, exam_title, exam_titles, subject, body, status, officer_reply, replied_at, created_at")
          .eq("school_id", schoolId!)
          .order("created_at", { ascending: true })
          .limit(200);
        if (studentId) q2 = q2.eq("student_id", studentId);
        else if (userId) q2 = q2.eq("student_user_id", userId);
        const r2 = await q2;
        return (r2.data ?? []) as ReportRow[];
      }
      return (data ?? []) as ReportRow[];
    },
  });

  const rows = mineQ.data ?? [];
  const exams = examsQ.data ?? [];

  // One conversation with officer — all rows
  const chatMessages: ChatMsg[] = useMemo(() => {
    const out: ChatMsg[] = [];
    for (const r of rows) {
      out.push({
        key: `${r.id}-s`,
        side: "out",
        text: r.body,
        at: r.created_at,
        subject: r.subject,
        attachment_url: r.attachment_url,
        attachment_type: r.attachment_type,
        reportId: r.id,
      });
      if (r.officer_reply) {
        out.push({
          key: `${r.id}-o`,
          side: "in",
          text: r.officer_reply,
          at: r.replied_at || r.created_at,
          reportId: r.id,
        });
      }
    }
    return out;
  }, [rows]);

  const latest = rows.length ? rows[rows.length - 1] : null;
  const inboxUnread = useMemo(
    () =>
      rows.filter((r) => {
        if (!r.officer_reply) return false;
        if (!r.student_read_at) return true;
        const read = new Date(r.student_read_at).getTime();
        const replyAt = new Date(r.replied_at || r.created_at).getTime();
        return replyAt > read;
      }).length,
    [rows],
  );

  const listPreview = useMemo(() => {
    if (!latest) return null;
    const lastMsg = chatMessages[chatMessages.length - 1];
    return {
      preview: lastMsg?.text || "",
      at: lastMsg?.at || latest.created_at,
      unread: inboxUnread,
    };
  }, [latest, chatMessages, inboxUnread]);

  const showInList = useMemo(() => {
    if (!listPreview) return false;
    if (tab === "inbox") return inboxUnread > 0 || rows.some((r) => r.officer_reply);
    if (tab === "sent") return rows.length > 0;
    return rows.length > 0 || true;
  }, [tab, listPreview, inboxUnread, rows.length]);

  const filteredShow =
    !search.trim() ||
    (listPreview &&
      `${listPreview.preview} Departmental Officer`.toLowerCase().includes(search.trim().toLowerCase()));

  useEffect(() => {
    if (!schoolId || !userId) return;
    const api = joinMessagingPresence(
      schoolId,
      { userId, role: "student", conversationKey: studentId || userId },
      {
        onPresence(map) {
          let online = false;
          let typing = false;
          let recording = false;
          map.forEach((p) => {
            if (p.role === "officer" && p.online) {
              online = true;
              if (p.typing) typing = true;
              if (p.recording) recording = true;
            }
          });
          setOfficerOnline(online);
          setOfficerTyping(typing);
          setOfficerRecording(recording);
        },
      },
    );
    presenceApi.current = api;
    return () => api.leave();
  }, [schoolId, userId, studentId]);

  // Mark read when opening chat
  useEffect(() => {
    if (!inChat || !rows.length) return;
    const now = new Date().toISOString();
    setPeerReadAt((prev) => {
      const maxOfficer = rows.reduce((m, r) => {
        const t = r.officer_read_at ? new Date(r.officer_read_at).getTime() : 0;
        return Math.max(m, t);
      }, 0);
      return maxOfficer ? new Date(maxOfficer).toISOString() : prev;
    });
    const ids = rows.filter((r) => r.officer_reply).map((r) => r.id);
    if (ids.length) {
      void supabase
        .from("student_officer_reports")
        .update({ student_read_at: now } as never)
        .in("id", ids)
        .then(() => qc.invalidateQueries({ queryKey: ["student-my-reports"] }));
    }
  }, [inChat, rows.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (inChat) chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [inChat, chatMessages.length, officerTyping]);

  const selectedTitles = useMemo(
    () => exams.filter((e) => selectedExamIds.includes(e.id)).map((e) => e.title),
    [exams, selectedExamIds],
  );
  const filteredExams = useMemo(() => {
    const q = examSearch.trim().toLowerCase();
    return q ? exams.filter((e) => e.title.toLowerCase().includes(q)) : exams;
  }, [exams, examSearch]);

  async function uploadBlob(blob: Blob, kind: string) {
    const ext = kind.startsWith("audio") ? "webm" : kind.includes("png") ? "png" : "bin";
    const path = `msg/${schoolId}/${userId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("message-media").upload(path, blob, {
      contentType: kind,
      upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from("message-media").getPublicUrl(path);
    return data.publicUrl;
  }

  const sendMessage = useCallback(
    async (text: string, attach?: { url: string; type: string } | null) => {
      if (sendLock.current) return;
      if (!schoolId) return;
      if (!text.trim() && !attach) return;
      if (!isOnlineNow()) {
        toast.error("Internet connection is required to send messages.");
        return;
      }
      sendLock.current = true;
      setSending(true);
      const tempId = `tmp-${Date.now()}`;
      // optimistic: invalidate after real insert only for speed
      try {
        const name = session?.fullName || student?.fullName || "Student";
        const { data, error } = await supabase
          .from("student_officer_reports")
          .insert({
            school_id: schoolId,
            student_id: studentId || null,
            student_user_id: userId || null,
            student_name: name,
            student_matric: student?.matric || null,
            exam_id: selectedExamIds[0] || null,
            exam_title: selectedTitles[0] || null,
            exam_ids: selectedExamIds.length ? selectedExamIds : [],
            exam_titles: selectedTitles.length ? selectedTitles : [],
            subject: subject.trim() || "Message",
            body: text.trim() || (attach ? "(attachment)" : ""),
            status: "open",
            attachment_url: attach?.url || null,
            attachment_type: attach?.type || null,
          } as never)
          .select("id")
          .maybeSingle();
        if (error) {
          // retry without attachment columns
          const { error: e2 } = await supabase.from("student_officer_reports").insert({
            school_id: schoolId,
            student_id: studentId || null,
            student_user_id: userId || null,
            student_name: name,
            student_matric: student?.matric || null,
            exam_id: selectedExamIds[0] || null,
            exam_title: selectedTitles[0] || null,
            subject: subject.trim() || "Message",
            body: text.trim() || "(attachment)",
            status: "open",
          } as never);
          if (e2) throw e2;
        }
        void data;
        void tempId;
        setBody("");
        setSubject("");
        setReplyText("");
        setPendingAttach(null);
        setComposeOpen(false);
        setInChat(true);
        await qc.invalidateQueries({ queryKey: ["student-my-reports"] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not send");
      } finally {
        setSending(false);
        sendLock.current = false;
      }
    },
    [
      schoolId,
      session?.fullName,
      student?.fullName,
      student?.matric,
      studentId,
      userId,
      selectedExamIds,
      selectedTitles,
      subject,
      qc,
    ],
  );

  function onTyping(v: string) {
    setReplyText(v);
    presenceApi.current?.setTyping(v.trim().length > 0, studentId || userId);
  }

  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        presenceApi.current?.setRecording(false, studentId || userId);
        setRecording(false);
        const blob = new Blob(chunks.current, { type: "audio/webm" });
        if (blob.size < 200) return;
        try {
          const url = await uploadBlob(blob, "audio/webm");
          await sendMessage("", { url, type: "audio" });
        } catch {
          toast.error("Could not upload voice note");
        }
      };
      mediaRec.current = rec;
      rec.start();
      setRecording(true);
      presenceApi.current?.setRecording(true, studentId || userId);
    } catch {
      toast.error("Microphone permission is required for voice notes");
    }
  }

  function stopRec() {
    try {
      mediaRec.current?.stop();
    } catch {
      /* ignore */
    }
  }

  async function onFile(file: File) {
    try {
      const url = await uploadBlob(file, file.type || "application/octet-stream");
      setPendingAttach({ url, type: file.type.startsWith("image/") ? "image" : "file" });
    } catch {
      toast.error("Upload failed. Ask admin to create storage bucket message-media.");
    }
  }

  const maxOfficerRead = useMemo(() => {
    let m = 0;
    for (const r of rows) {
      if (r.officer_read_at) m = Math.max(m, new Date(r.officer_read_at).getTime());
    }
    return m ? new Date(m).toISOString() : peerReadAt;
  }, [rows, peerReadAt]);

  return (
    <div className="flex h-dvh max-h-dvh flex-col bg-white">
      {!inChat && !composeOpen ? (
        <>
          <div className="shrink-0 border-b border-slate-100 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate({ to: "/student" })}
                className="grid h-9 w-9 place-items-center rounded-full hover:bg-slate-100"
                aria-label="Back"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <h1 className="text-lg font-extrabold text-slate-900">Messages</h1>
                <p className="text-[11px] text-slate-500">Contact your departmental officer</p>
              </div>
            </div>
            <Button
              type="button"
              className="h-11 w-full rounded-xl bg-[#2563eb] font-bold hover:bg-[#1d4ed8]"
              onClick={() => setComposeOpen(true)}
            >
              + New Message
            </Button>
            <div className="mt-3 flex gap-1 rounded-full bg-slate-100 p-1">
              {(
                [
                  { k: "inbox" as const, label: "Inbox", count: inboxUnread },
                  { k: "sent" as const, label: "Sent" },
                  { k: "all" as const, label: "All" },
                ] as const
              ).map((t) => (
                <button
                  key={t.k}
                  type="button"
                  onClick={() => setTab(t.k)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1 rounded-full py-2 text-xs font-bold",
                    tab === t.k ? "bg-[#2563eb] text-white" : "text-slate-600",
                  )}
                >
                  {t.label}
                  {"count" in t && t.count > 0 ? (
                    <span className="grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] text-white">
                      {t.count > 99 ? "99+" : t.count}
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
                className="h-10 rounded-xl bg-slate-50 pl-9"
              />
            </div>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {showInList && filteredShow && listPreview ? (
              <li>
                <button
                  type="button"
                  onClick={() => setInChat(true)}
                  className="flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#0b1b3a] text-white">
                    <User className="h-5 w-5" />
                    <span
                      className={cn(
                        "absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-white",
                        officerOnline ? "bg-emerald-400" : "bg-slate-300",
                      )}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2">
                      <p className="truncate text-sm font-bold">Departmental Officer</p>
                      <span className="text-[10px] text-slate-400">{formatWhen(listPreview.at)}</span>
                    </div>
                    <p className="line-clamp-1 text-xs text-slate-500">{listPreview.preview}</p>
                    <p className={cn("text-[10px] font-medium", officerOnline ? "text-emerald-600" : "text-slate-400")}>
                      {officerOnline ? "● Online" : "○ Offline"}
                    </p>
                  </div>
                  {listPreview.unread > 0 ? (
                    <span className="mt-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                      {listPreview.unread}
                    </span>
                  ) : null}
                </button>
              </li>
            ) : (
              <li className="px-4 py-12 text-center text-sm text-slate-500">
                No messages yet. Tap New Message to contact your officer.
              </li>
            )}
          </ul>
        </>
      ) : null}

      {composeOpen ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button type="button" onClick={() => setComposeOpen(false)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-slate-100">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h2 className="font-extrabold">New Message</h2>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            <div>
              <label className="text-xs font-bold uppercase text-slate-500">Examination(s)</label>
              <button
                type="button"
                onClick={() => setPickerOpen((o) => !o)}
                className="mt-1 flex h-11 w-full items-center justify-between rounded-xl border px-3 text-sm"
              >
                <span className="truncate">
                  {selectedTitles.length ? selectedTitles.join(", ") : "Select examination(s)…"}
                </span>
                <Search className="h-4 w-4 text-slate-400" />
              </button>
              {pickerOpen ? (
                <div className="mt-2 rounded-xl border shadow-lg">
                  <Input value={examSearch} onChange={(e) => setExamSearch(e.target.value)} placeholder="Search…" className="border-0" />
                  <ul className="max-h-40 overflow-y-auto">
                    {filteredExams.map((e) => {
                      const on = selectedExamIds.includes(e.id);
                      return (
                        <li key={e.id}>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                            onClick={() =>
                              setSelectedExamIds((p) => (on ? p.filter((x) => x !== e.id) : [...p, e.id]))
                            }
                          >
                            <span className={cn("grid h-5 w-5 place-items-center rounded border", on && "bg-blue-600 text-white")}>
                              {on ? <Check className="h-3 w-3" /> : null}
                            </span>
                            {e.title}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <Button size="sm" className="m-2" onClick={() => setPickerOpen(false)}>
                    Done
                  </Button>
                </div>
              ) : null}
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-slate-500">Subject</label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 h-11 rounded-xl" placeholder="Subject" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-slate-500">Message</label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="mt-1 min-h-[120px] rounded-xl" placeholder="Write your message…" />
            </div>
            {pendingAttach ? (
              <p className="text-xs text-slate-600">Attachment ready · {pendingAttach.type}</p>
            ) : null}
          </div>
          <div className="border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button
              className="h-12 w-full rounded-xl bg-[#2563eb] font-bold"
              disabled={sending || (!body.trim() && !pendingAttach)}
              onClick={() => void sendMessage(body, pendingAttach)}
            >
              <Send className="mr-2 h-4 w-4" /> Send
            </Button>
          </div>
        </div>
      ) : null}

      {inChat ? (
        <>
          <div className="flex shrink-0 items-center gap-3 border-b bg-white px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button type="button" onClick={() => setInChat(false)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-slate-100">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <span className="relative grid h-10 w-10 place-items-center rounded-full bg-[#0b1b3a] text-white">
              <User className="h-5 w-5" />
              <span className={cn("absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white", officerOnline ? "bg-emerald-400" : "bg-slate-300")} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">Departmental Officer</p>
              <p className={cn("text-[11px] font-medium", officerOnline ? "text-emerald-600" : "text-slate-400")}>
                {officerRecording ? "Recording…" : officerTyping ? "Typing…" : officerOnline ? "Online" : "Offline"}
              </p>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50 px-3 py-3">
            {chatMessages.map((m) => {
              const tick =
                m.side === "out"
                  ? ticksFor({
                      isMine: true,
                      createdAt: m.at,
                      peerOnline: officerOnline,
                      peerReadAt: maxOfficerRead,
                    })
                  : "none";
              return (
                <div key={m.key} className={cn("flex", m.side === "out" ? "justify-end" : "justify-start gap-2")}>
                  {m.side === "in" ? (
                    <span className="mt-1 grid h-7 w-7 place-items-center rounded-full bg-[#0b1b3a] text-white">
                      <User className="h-3.5 w-3.5" />
                    </span>
                  ) : null}
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                      m.side === "out" ? "rounded-br-md bg-[#2563eb] text-white" : "rounded-bl-md border bg-white text-slate-800",
                    )}
                  >
                    {m.subject && m.side === "out" ? (
                      <p className="mb-0.5 text-[11px] font-semibold opacity-80">{m.subject}</p>
                    ) : null}
                    {m.attachment_type === "image" && m.attachment_url ? (
                      <img src={m.attachment_url} alt="" className="mb-1 max-h-40 rounded-lg" />
                    ) : null}
                    {m.attachment_type === "audio" && m.attachment_url ? (
                      <audio controls src={m.attachment_url} className="mb-1 max-w-full" />
                    ) : null}
                    {m.attachment_type === "file" && m.attachment_url ? (
                      <a href={m.attachment_url} target="_blank" rel="noreferrer" className="mb-1 block underline">
                        Attachment
                      </a>
                    ) : null}
                    {m.text && m.text !== "(attachment)" ? <p className="whitespace-pre-wrap">{m.text}</p> : null}
                    <p className={cn("mt-1 flex items-center justify-end gap-1 text-[10px]", m.side === "out" ? "text-blue-100" : "text-slate-400")}>
                      {formatTime(m.at)}
                      {m.side === "out" ? <Ticks state={tick} /> : null}
                    </p>
                  </div>
                </div>
              );
            })}
            {officerTyping ? (
              <p className="text-center text-xs text-slate-500">Officer is typing…</p>
            ) : null}
            {officerRecording ? (
              <p className="text-center text-xs text-slate-500">Officer is recording…</p>
            ) : null}
            <div ref={chatEndRef} />
          </div>
          <div className="shrink-0 border-t bg-white px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }} />
            <div className="flex items-end gap-1.5">
              <button type="button" className="mb-1 grid h-9 w-9 place-items-center rounded-full text-slate-500" onClick={() => fileRef.current?.click()} aria-label="Attach file">
                <Paperclip className="h-5 w-5" />
              </button>
              <div className="flex min-w-0 flex-1 items-end rounded-full border bg-slate-50 px-3">
                <textarea
                  value={replyText}
                  onChange={(e) => onTyping(e.target.value)}
                  rows={1}
                  placeholder="Type your message…"
                  className="max-h-24 min-h-[36px] w-full resize-none bg-transparent py-2 text-sm outline-none"
                />
              </div>
              {replyText.trim() || pendingAttach ? (
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => void sendMessage(replyText, pendingAttach)}
                  className="mb-0.5 grid h-10 w-10 place-items-center rounded-full bg-[#2563eb] text-white"
                  aria-label="Send"
                >
                  <Send className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  className={cn("mb-0.5 grid h-10 w-10 place-items-center rounded-full text-white", recording ? "bg-red-500" : "bg-[#0b1b3a]")}
                  onMouseDown={() => void startRec()}
                  onMouseUp={stopRec}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    void startRec();
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    stopRec();
                  }}
                  aria-label="Hold to record"
                >
                  {recording ? <X className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
              )}
            </div>
            {recording ? <p className="mt-1 text-center text-[11px] font-medium text-red-600">Recording… release to send</p> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
