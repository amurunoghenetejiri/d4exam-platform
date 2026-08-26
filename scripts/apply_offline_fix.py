from pathlib import Path

p = Path("src/routes/officer.live-monitor.tsx")
t = p.read_text()

# 1) Dual-key frame storage in onFrame
old_onframe = """        setFrames((prev) => ({
          ...prev,
          [attemptId]: { src: p.frame, ts: p.ts || Date.now(), faceStatus: p.faceStatus, cameraActive: p.cameraActive !== false, answeredCount: p.answeredCount, totalQuestions: p.totalQuestions, timeRemainingSec: p.timeRemainingSec },
        }));"""

new_onframe = """        const entry = {
          src: p.frame,
          ts: p.ts || Date.now(),
          faceStatus: p.faceStatus,
          cameraActive: p.cameraActive !== false,
          answeredCount: p.answeredCount,
          totalQuestions: p.totalQuestions,
          timeRemainingSec: p.timeRemainingSec,
        };
        const sid = String(p.studentId || (p as { student_id?: string }).student_id || "");
        setFrames((prev) => {
          const next = { ...prev, [attemptId]: entry };
          if (sid) next[`student:${sid}`] = entry;
          return next;
        });"""

if old_onframe in t:
    t = t.replace(old_onframe, new_onframe, 1)
    print("patched onFrame")
else:
    print("onFrame pattern not found")

# 2) Frame lookup dual key + force cameraActive true + sev override
old_map = """        const basePresence = parsePresence(a.metadata);
        const frame = frames[a.id];
        const st = String(a.status || "").toLowerCase();
        const isDone = ["submitted", "terminated", "flagged", "completed"].includes(st);
        const hasLiveVideo = !isDone && Boolean(frame && isLiveCamFrameFresh(frame.ts, now));
        // Prefer live Realtime frame for online/camera/face so officers never see Offline while video is live
        const presence = { ...basePresence };
        if (hasLiveVideo && frame) {
          presence.lastSeenAt = new Date(frame.ts).toISOString();
          presence.cameraActive = frame.cameraActive !== false;
          if (frame.faceStatus) {
            const fs = String(frame.faceStatus).toLowerCase();
            if (fs === "ok" || fs === "none" || fs === "multi" || fs === "unclear" || fs === "unavailable") {
              presence.faceStatus = fs as typeof presence.faceStatus;
            }
          }
          if (typeof frame.answeredCount === "number") presence.answeredCount = frame.answeredCount;
          if (typeof frame.totalQuestions === "number") presence.totalQuestions = frame.totalQuestions;
          if (typeof frame.timeRemainingSec === "number") presence.timeRemainingSec = frame.timeRemainingSec;
        } else if (frame?.ts && !presence.lastSeenAt) {
          presence.lastSeenAt = new Date(frame.ts).toISOString();
        }
        const sev: MonitorSeverity = isDone ? "completed" : severityFromPresence(a.status, presence, now);"""

new_map = """        const basePresence = parsePresence(a.metadata);
        const frame = frames[a.id] || frames[`student:${a.student_id}`];
        const st = String(a.status || "").toLowerCase();
        const isDone = ["submitted", "terminated", "flagged", "completed"].includes(st);
        const hasLiveVideo = !isDone && Boolean(frame && isLiveCamFrameFresh(frame.ts, now));
        // Prefer live Realtime frame — never show Offline while video frames are arriving
        const presence = { ...basePresence };
        if (hasLiveVideo && frame) {
          presence.lastSeenAt = new Date(frame.ts).toISOString();
          presence.cameraActive = true;
          if (frame.faceStatus) {
            const fs = String(frame.faceStatus).toLowerCase();
            if (fs === "ok" || fs === "none" || fs === "multi" || fs === "unclear" || fs === "unavailable") {
              presence.faceStatus = fs as typeof presence.faceStatus;
            }
          } else if (!presence.faceStatus || presence.faceStatus === "unknown" || presence.faceStatus === "unavailable") {
            presence.faceStatus = "ok";
          }
          if (typeof frame.answeredCount === "number") presence.answeredCount = frame.answeredCount;
          if (typeof frame.totalQuestions === "number") presence.totalQuestions = frame.totalQuestions;
          if (typeof frame.timeRemainingSec === "number") presence.timeRemainingSec = frame.timeRemainingSec;
        } else if (frame?.ts && !presence.lastSeenAt) {
          presence.lastSeenAt = new Date(frame.ts).toISOString();
        }
        let sev: MonitorSeverity = isDone ? "completed" : severityFromPresence(a.status, presence, now);
        if (!isDone && hasLiveVideo && sev === "offline") {
          const fs = presence.faceStatus;
          if (fs === "multi") sev = "violation";
          else if (fs === "none" || fs === "unclear") sev = "warning";
          else sev = "normal";
        }"""

if old_map in t:
    t = t.replace(old_map, new_map, 1)
    print("patched cards map")
else:
    print("map pattern missing")
    i = t.find("const basePresence = parsePresence")
    print(repr(t[i:i+180]) if i >= 0 else "no basePresence")

# 3) humanLiveStatus helper
if "function humanLiveStatus" not in t:
    helper = """
function humanLiveStatus(sev: MonitorSeverity): string {
  if (sev === "normal") return "Online";
  if (sev === "warning") return "Warning";
  if (sev === "violation") return "Violation";
  if (sev === "offline") return "Offline";
  if (sev === "completed") return "Completed";
  return String(sev);
}
"""
    anchor = "function doneStatusLabel(status: string): string {"
    idx = t.find(anchor)
    if idx >= 0:
        end = t.find("\n}\n", idx) + 3
        t = t[:end] + helper + t[end:]
        print("added humanLiveStatus")

old_status = "value={selected.isDone ? doneStatusLabel(selected.a.status) : selected.sev}"
new_status = "value={selected.isDone ? doneStatusLabel(selected.a.status) : humanLiveStatus(selected.sev)}"
if old_status in t:
    t = t.replace(old_status, new_status, 1)
    print("patched status label")

p.write_text(t)
assert "presence.cameraActive = true" in t
assert "student:${a.student_id}" in t
assert "hasLiveVideo && sev === " in t
print("OK", p.stat().st_size)
