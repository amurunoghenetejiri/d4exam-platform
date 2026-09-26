#!/usr/bin/env python3
"""Fix voice not sending: do not hold sendLock across sendMessage call."""
from pathlib import Path

def fix(path: str):
    p = Path(path)
    if not p.exists():
        print("skip", path)
        return
    t = p.read_text()
    old = """  async function sendPendingAudio() {
    if (sendLock.current) return;
    if (!pendingAudio && !recording) return;
    sendLock.current = true;
    const wasRecording = recording;
    // Collapse recorder UI immediately
    setRecording(false);
    setRecPaused(false);
    presenceApi.current?.setRecording(false, studentId || userId);
    try {
      if (wasRecording) {
        stopRecKeep();
        await new Promise((r) => setTimeout(r, 200));
      }
      const blob =
        pendingAudio ||
        (chunks.current.length ? new Blob(chunks.current, { type: "audio/webm" }) : null);
      if (!blob || blob.size < 200) {
        cancelRec();
        return;
      }
      setPendingAudio(null);
      setPendingAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      const up = await uploadMessageMedia(blob, "audio/webm", `msg/${schoolId}/${userId}`);
      await sendMessage("", { url: up.url, type: "audio" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send voice note");
    } finally {
      sendLock.current = false;
    }
  }"""
    new = """  async function sendPendingAudio() {
    if (sendLock.current) return;
    if (!pendingAudio && !recording && !(mediaRec.current && mediaRec.current.state !== "inactive")) return;
    const wasRecording = recording || Boolean(mediaRec.current && mediaRec.current.state !== "inactive");
    setRecording(false);
    setRecPaused(false);
    presenceApi.current?.setRecording(false, studentId || userId);
    try {
      if (wasRecording && mediaRec.current && mediaRec.current.state !== "inactive") {
        await new Promise<void>((resolve) => {
          const rec = mediaRec.current!;
          const prev = rec.onstop;
          rec.onstop = (ev) => {
            try {
              if (typeof prev === "function") (prev as (this: MediaRecorder, ev: Event) => void).call(rec, ev);
            } finally {
              resolve();
            }
          };
          try { rec.stop(); } catch { resolve(); }
        });
        await new Promise((r) => setTimeout(r, 80));
      }
      const blob =
        pendingAudio ||
        (chunks.current.length ? new Blob(chunks.current, { type: "audio/webm" }) : null);
      if (!blob || blob.size < 200) {
        cancelRec();
        return;
      }
      setPendingAudio(null);
      setPendingAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      mediaRec.current = null;
      chunks.current = [];
      const up = await uploadMessageMedia(blob, "audio/webm", `msg/${schoolId}/${userId}`);
      await sendMessage("", { url: up.url, type: "audio" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send voice note");
    }
  }"""
    if old in t:
        t = t.replace(old, new)
        print("replaced exact spa", path)
    else:
        if "sendLock.current = true;\n    const wasRecording = recording;" in t:
            t = t.replace("sendLock.current = true;\n    const wasRecording = recording;", "const wasRecording = recording;")
            t = t.replace(
                """    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send voice note");
    } finally {
      sendLock.current = false;
    }
  }

  async function onFile""",
                """    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send voice note");
    }
  }

  async function onFile""",
            )
            print("fallback lock remove", path)
        else:
            print("no match", path)

    t = t.replace(
        "recording ? stopRecKeep() : void startRec()",
        "recording || pendingAudio || pendingAudioUrl ? void sendPendingAudio() : void startRec()",
    )
    if "pendingAudioUrl ? <Send" not in t and 'Mic className="h-6 w-6"' in t:
        t = t.replace(
            '<Mic className="h-6 w-6" />',
            '{recording || pendingAudio || pendingAudioUrl ? <Send className="h-5 w-5" /> : <Mic className="h-7 w-7 stroke-[2.5]" />}',
            1,
        )
        print("mic icon", path)

    p.write_text(t)
    print("done", path, len(t))

fix("src/routes/student.contact-officer.tsx")
print("ALL OK")
