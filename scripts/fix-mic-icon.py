#!/usr/bin/env python3
from pathlib import Path
p = Path("src/routes/student.contact-officer.tsx")
t = p.read_text()
old = '''            <button type="button" className={cn("mb-0.5 grid h-10 w-10 place-items-center rounded-full text-white", recording ? "bg-red-500" : "bg-[#0b1b3a]")} onClick={() => (recording || pendingAudio || pendingAudioUrl ? void sendPendingAudio() : void startRec())} aria-label="Record voice">
              <Mic className="h-4 w-4" />
            </button>'''
new = '''            <button type="button" className={cn("mb-0.5 grid h-12 w-12 place-items-center rounded-full shadow-md", recording || pendingAudio || pendingAudioUrl ? "bg-[#2563eb] text-white ring-2 ring-white/40" : "bg-white text-[#0b1b3a] ring-2 ring-white/70")} onClick={() => (recording || pendingAudio || pendingAudioUrl ? void sendPendingAudio() : void startRec())} aria-label={recording || pendingAudio || pendingAudioUrl ? "Send voice note" : "Record voice"}>
              {recording || pendingAudio || pendingAudioUrl ? <Send className="h-5 w-5" /> : <Mic className="h-7 w-7 stroke-[2.5]" />}
            </button>'''
if old in t:
    t = t.replace(old, new)
    print("mic replaced")
else:
    print("no match")
p.write_text(t)
print("done", len(t))
