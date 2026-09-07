import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Image as ImageIcon,
  Loader2,
  Mic,
  Paperclip,
  Send,
  LogOut,
  FileText,
  Volume2,
  Reply,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSessionUser } from "@/lib/session";
import { useStudentContext } from "@/lib/student";
import {
  leaveGroup,
  markGroupRead,
  sendTextMessage,
  uploadStudyOrbFile,
  useGroupMessages,
  useMyStudyGroups,
  type StudyMessage,
} from "@/lib/study-orb";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/student/study-orb/$groupId")({
  head: () => ({
    meta: [{ title: "Study Group — D4EXAM" }],
  }),
  component: StudyGroupChat,
});

function StudyGroupChat() {
  const { groupId } = Route.useParams();
  const { data: session } = useSessionUser();
  const { data: student } = useStudentContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const myGroups = useMyStudyGroups();
  const messagesQ = useGroupMessages(groupId);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<StudyMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const imageRef = useRef<HTMLInputElement | null>(null);

  const group = useMemo(
    () => (myGroups.data ?? []).find((g) => g.id === groupId),
    [myGroups.data, groupId],
  );

  const groupMetaQ = useQuery({
    queryKey: ["study-orb-group", groupId],
    enabled: Boolean(groupId) && !group,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("study_groups")
        .select(
          "id, name, description, member_count, visibility, departments(name), courses(code, name), levels(name)",
        )
        .eq("id", groupId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const displayGroup = group || (groupMetaQ.data as typeof group);
  const messages = messagesQ.data ?? [];

  useEffect(() => {
    if (session?.profileId && groupId) {
      void markGroupRead(groupId, session.profileId);
    }
  }, [groupId, session?.profileId, messages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function onSend() {
    if (!session?.profileId || !text.trim()) return;
    setBusy(true);
    try {
      await sendTextMessage({
        groupId,
        profileId: session.profileId,
        body: text,
        replyToId: replyTo?.id,
      });
      setText("");
      setReplyTo(null);
      void qc.invalidateQueries({ queryKey: ["study-orb-messages", groupId] });
      void qc.invalidateQueries({ queryKey: ["study-orb-my-groups"] });
    } catch (e) {
      toast.error((e as Error).message || "Failed to send");
    } finally {
      setBusy(false);
    }
  }

  async function onFileSelected(file: File | null, asImage: boolean) {
    if (!file || !session?.profileId || !student?.schoolId) return;
    if (file.size > 12 * 1024 * 1024) {
      toast.error("File is too large (max 12 MB)");
      return;
    }
    setBusy(true);
    try {
      const up = await uploadStudyOrbFile(student.schoolId, groupId, file);
      if (!up) throw new Error("Upload failed");
      const type = asImage || file.type.startsWith("image/") ? "image" : "document";
      const { error } = await supabase.from("study_group_messages").insert({
        group_id: groupId,
        sender_profile_id: session.profileId,
        message_type: type,
        body: file.name,
        attachment_url: up.url,
        attachment_name: up.name,
        attachment_mime: up.mime,
        attachment_size: up.size,
      } as never);
      if (error) throw error;
      await supabase
        .from("study_groups")
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: type === "image" ? "📷 Image" : `📎 ${file.name}`,
        } as never)
        .eq("id", groupId);
      void qc.invalidateQueries({ queryKey: ["study-orb-messages", groupId] });
    } catch (e) {
      toast.error((e as Error).message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size) chunksRef.current.push(ev.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size < 500) return;
        const file = new File([blob], `voice_${Date.now()}.webm`, { type: "audio/webm" });
        if (!session?.profileId || !student?.schoolId) return;
        setBusy(true);
        try {
          const up = await uploadStudyOrbFile(student.schoolId, groupId, file);
          if (!up) throw new Error("Voice upload failed");
          const { error } = await supabase.from("study_group_messages").insert({
            group_id: groupId,
            sender_profile_id: session.profileId,
            message_type: "voice",
            body: "Voice note",
            attachment_url: up.url,
            attachment_name: up.name,
            attachment_mime: up.mime,
            attachment_size: up.size,
            duration_ms: null,
          } as never);
          if (error) throw error;
          await supabase
            .from("study_groups")
            .update({
              last_message_at: new Date().toISOString(),
              last_message_preview: "🎤 Voice note",
            } as never)
            .eq("id", groupId);
          void qc.invalidateQueries({ queryKey: ["study-orb-messages", groupId] });
        } catch (e) {
          toast.error((e as Error).message || "Could not send voice note");
        } finally {
          setBusy(false);
        }
      };
      mediaRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      toast.error("Microphone permission denied");
    }
  }

  function stopRecording() {
    mediaRef.current?.stop();
    mediaRef.current = null;
    setRecording(false);
  }

  async function onLeave() {
    if (!session?.profileId) return;
    if (!confirm("Leave this study group?")) return;
    await leaveGroup(groupId, session.profileId);
    toast.success("Left group");
    void qc.invalidateQueries({ queryKey: ["study-orb-my-groups"] });
    void navigate({ to: "/student/study-orb" });
  }

  const title = displayGroup?.name || "Study group";

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#0b1220] text-white sm:static sm:inset-auto sm:z-auto sm:min-h-[70vh] sm:rounded-2xl sm:border sm:border-slate-200 sm:bg-white sm:text-slate-900">
      <header className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-[#0f172a] px-3 py-2.5 sm:rounded-t-2xl sm:border-slate-100 sm:bg-white">
        <Link
          to="/student/study-orb"
          className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10 sm:hover:bg-slate-100"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{title}</p>
          <p className="truncate text-[11px] text-slate-400 sm:text-slate-500">
            {[
              displayGroup && "member_count" in displayGroup
                ? `${(displayGroup as { member_count?: number }).member_count ?? "—"} members`
                : null,
              (displayGroup as { courses?: { code?: string } } | undefined)?.courses?.code,
              (displayGroup as { departments?: { name?: string } } | undefined)?.departments?.name,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <button
          type="button"
          className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10 sm:hover:bg-slate-100"
          onClick={() => void onLeave()}
          title="Leave group"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {messagesQ.isLoading && (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading messages…
          </p>
        )}
        {!messagesQ.isLoading && messages.length === 0 && (
          <p className="py-12 text-center text-sm text-slate-400">Start the conversation.</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_profile_id === session?.profileId;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                  mine
                    ? "rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-bl-md bg-white/10 text-white sm:bg-slate-100 sm:text-slate-900",
                )}
              >
                {!mine && (
                  <p className="mb-0.5 text-[10px] font-bold opacity-70">
                    {m.profiles?.full_name || "Student"}
                  </p>
                )}
                {m.reply_to_id && (
                  <p className="mb-1 border-l-2 border-white/40 pl-2 text-[10px] opacity-80">
                    Replying…
                  </p>
                )}
                {m.message_type === "image" && m.attachment_url && (
                  <a href={m.attachment_url} target="_blank" rel="noreferrer" className="block">
                    <img
                      src={m.attachment_url}
                      alt={m.attachment_name || "image"}
                      className="mb-1 max-h-48 rounded-lg object-cover"
                      loading="lazy"
                    />
                  </a>
                )}
                {m.message_type === "document" && m.attachment_url && (
                  <a
                    href={m.attachment_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mb-1 flex items-center gap-2 rounded-lg bg-black/20 px-2 py-1.5 text-xs font-semibold"
                  >
                    <FileText className="h-4 w-4" />
                    <span className="truncate">{m.attachment_name || "Document"}</span>
                  </a>
                )}
                {m.message_type === "voice" && m.attachment_url && (
                  <div className="mb-1 flex items-center gap-2">
                    <Volume2 className="h-4 w-4 shrink-0" />
                    <audio controls src={m.attachment_url} className="h-8 max-w-[200px]" />
                  </div>
                )}
                {m.message_type === "question" && (
                  <span className="mb-1 inline-block rounded bg-amber-500/20 px-1.5 text-[10px] font-bold text-amber-300">
                    ❓ QUESTION
                  </span>
                )}
                {m.message_type === "announcement" && (
                  <span className="mb-1 inline-block rounded bg-sky-500/20 px-1.5 text-[10px] font-bold text-sky-300">
                    📢 ANNOUNCEMENT
                  </span>
                )}
                {m.body && m.message_type !== "image" && m.message_type !== "document" && (
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                )}
                <div className="mt-1 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="opacity-60 hover:opacity-100"
                    onClick={() => setReplyTo(m)}
                    title="Reply"
                  >
                    <Reply className="h-3 w-3" />
                  </button>
                  <span className="text-[10px] opacity-50">
                    {new Date(m.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-white/10 bg-[#0f172a] px-2 py-2 sm:rounded-b-2xl sm:border-slate-100 sm:bg-white">
        {replyTo && (
          <div className="mb-1 flex items-center justify-between rounded-lg bg-white/5 px-2 py-1 text-[11px] sm:bg-slate-50">
            <span className="truncate">Replying to {replyTo.profiles?.full_name || "message"}</span>
            <button type="button" onClick={() => setReplyTo(null)} className="px-1">
              ✕
            </button>
          </div>
        )}
        <div className="flex items-end gap-1.5">
          <input
            ref={imageRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void onFileSelected(e.target.files?.[0] ?? null, true)}
          />
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.png,.jpg,.jpeg"
            className="hidden"
            onChange={(e) => void onFileSelected(e.target.files?.[0] ?? null, false)}
          />
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full text-slate-300 hover:bg-white/10 sm:text-slate-500 sm:hover:bg-slate-100"
            onClick={() => imageRef.current?.click()}
            disabled={busy}
            title="Image"
          >
            <ImageIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full text-slate-300 hover:bg-white/10 sm:text-slate-500 sm:hover:bg-slate-100"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            title="Document"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <Input
            className="min-h-10 flex-1 border-white/10 bg-white/5 text-white placeholder:text-slate-500 sm:border-slate-200 sm:bg-white sm:text-slate-900"
            placeholder="Message…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void onSend();
              }
            }}
            disabled={busy}
          />
          {text.trim() ? (
            <Button
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full"
              disabled={busy}
              onClick={() => void onSend()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          ) : (
            <button
              type="button"
              className={cn(
                "grid h-10 w-10 place-items-center rounded-full",
                recording
                  ? "bg-rose-500 text-white"
                  : "text-slate-300 hover:bg-white/10 sm:text-slate-500 sm:hover:bg-slate-100",
              )}
              onMouseDown={() => void startRecording()}
              onMouseUp={stopRecording}
              onTouchStart={() => void startRecording()}
              onTouchEnd={stopRecording}
              disabled={busy}
              title="Hold to record voice note"
            >
              <Mic className="h-5 w-5" />
            </button>
          )}
        </div>
        {recording && (
          <p className="mt-1 text-center text-[11px] font-semibold text-rose-400">
            Recording… release to send
          </p>
        )}
      </div>
    </div>
  );
}
