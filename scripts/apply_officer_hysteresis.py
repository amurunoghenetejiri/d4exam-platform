#!/usr/bin/env python3
"""Surgical patch: officer live-monitor hysteresis + pause toggle. Idempotent."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "src/routes/officer.live-monitor.tsx"
text = TARGET.read_text(encoding="utf-8")
orig = text

# --- imports ---
if "isLiveCamFrameUsable" not in text:
    old = """import {
  isLiveCamFrameFresh,
  startLiveCamSubscriber,
  LIVE_CAM_STALE_MS,
  type LiveCamFramePayload,
  startLiveScreenSubscriber,
  isLiveScreenFrameFresh,
  type LiveScreenFramePayload,
} from \"@/lib/live-video\";"""
    new = """import {
  isLiveCamFrameFresh,
  isLiveCamFrameUsable,
  startLiveCamSubscriber,
  LIVE_CAM_STALE_MS,
  type LiveCamFramePayload,
  startLiveScreenSubscriber,
  isLiveScreenFrameFresh,
  isLiveScreenFrameUsable,
  type LiveScreenFramePayload,
} from \"@/lib/live-video\";"""
    if old not in text:
        print("FAIL: import block not found", file=sys.stderr)
        sys.exit(1)
    text = text.replace(old, new, 1)

# --- camUsable in cards ---
if "hasUsableVideo" not in text:
    old = """        const camLive = Boolean(camFrame && isLiveCamFrameFresh(camFrame.ts, now));
        const scrLive = Boolean(scrFrame && isLiveScreenFrameFresh(scrFrame.ts, now));
        const hasLiveVideo = !isDone && (
          feedMode === \"screen\" ? scrLive : feedMode === \"camera\" ? camLive : (camLive || scrLive)
        );
        // Prefer live Realtime frame — never show Offline while video frames are arriving
        const presence = { ...basePresence };
        if (hasLiveVideo && frame) {
          presence.lastSeenAt = new Date(frame.ts).toISOString();
          presence.cameraActive = true;
          if (frame.faceStatus) {
            const fs = String(frame.faceStatus).toLowerCase();
            if (fs === \"ok\" || fs === \"none\" || fs === \"multi\" || fs === \"unclear\" || fs === \"unavailable\") {
              presence.faceStatus = fs as typeof presence.faceStatus;
            }
          } else if (!presence.faceStatus || presence.faceStatus === \"unknown\" || presence.faceStatus === \"unavailable\") {
            presence.faceStatus = \"ok\";
          }
          if (typeof frame.answeredCount === \"number\") presence.answeredCount = frame.answeredCount;
          if (typeof frame.totalQuestions === \"number\") presence.totalQuestions = frame.totalQuestions;
          if (typeof frame.timeRemainingSec === \"number\") presence.timeRemainingSec = frame.timeRemainingSec;
        } else if (frame?.ts && !presence.lastSeenAt) {
          presence.lastSeenAt = new Date(frame.ts).toISOString();
        }
        let sev: MonitorSeverity = isDone ? \"completed\" : severityFromPresence(a.status, presence, now);
        if (!isDone && hasLiveVideo && sev === \"offline\") {
          const fs = presence.faceStatus;
          if (fs === \"multi\") sev = \"violation\";
          else if (fs === \"none\" || fs === \"unclear\") sev = \"warning\";
          else sev = \"normal\";
        }"""
    new = """        const camLive = Boolean(camFrame && isLiveCamFrameFresh(camFrame.ts, now));
        const scrLive = Boolean(scrFrame && isLiveScreenFrameFresh(scrFrame.ts, now));
        const camUsable = Boolean(camFrame?.src && isLiveCamFrameUsable(camFrame.ts, now));
        const scrUsable = Boolean(scrFrame?.src && isLiveScreenFrameUsable(scrFrame.ts, now));
        const hasLiveVideo = !isDone && (
          feedMode === \"screen\" ? scrLive : feedMode === \"camera\" ? camLive : (camLive || scrLive)
        );
        const hasUsableVideo = !isDone && (
          feedMode === \"screen\" ? scrUsable : feedMode === \"camera\" ? camUsable : (camUsable || scrUsable)
        );
        // Prefer live Realtime frame — never show offline while frames are still usable (hysteresis)
        const presence = { ...basePresence };
        if ((hasLiveVideo || hasUsableVideo) && (camFrame || scrFrame || frame)) {
          const srcTs = (camFrame?.ts ?? scrFrame?.ts ?? frame?.ts);
          if (srcTs) presence.lastSeenAt = new Date(srcTs).toISOString();
          if (camUsable || camLive) presence.cameraActive = true;
          const fsRaw = camFrame?.faceStatus ?? (frame as FrameEntry | undefined)?.faceStatus;
          if (fsRaw) {
            const fs = String(fsRaw).toLowerCase();
            if (fs === \"ok\" || fs === \"none\" || fs === \"multi\" || fs === \"unclear\" || fs === \"unavailable\") {
              presence.faceStatus = fs as typeof presence.faceStatus;
            }
          } else if (camUsable && (!presence.faceStatus || presence.faceStatus === \"unknown\" || presence.faceStatus === \"unavailable\")) {
            presence.faceStatus = \"ok\";
          }
          const ac = camFrame?.answeredCount ?? (frame as FrameEntry | undefined)?.answeredCount;
          const tq = camFrame?.totalQuestions ?? (frame as FrameEntry | undefined)?.totalQuestions;
          const tr = camFrame?.timeRemainingSec ?? (frame as FrameEntry | undefined)?.timeRemainingSec;
          if (typeof ac === \"number\") presence.answeredCount = ac;
          if (typeof tq === \"number\") presence.totalQuestions = tq;
          if (typeof tr === \"number\") presence.timeRemainingSec = tr;
        } else if (frame?.ts && !presence.lastSeenAt) {
          presence.lastSeenAt = new Date(frame.ts).toISOString();
        }
        let sev: MonitorSeverity = isDone ? \"completed\" : severityFromPresence(a.status, presence, now);
        if (!isDone && (hasLiveVideo || hasUsableVideo) && sev === \"offline\") {
          const fs = presence.faceStatus;
          if (fs === \"multi\") sev = \"violation\";
          else if (fs === \"none\" || fs === \"unclear\") sev = \"warning\";
          else sev = \"normal\";
        }"""
    if old not in text:
        print("FAIL: cards presence block not found", file=sys.stderr)
        sys.exit(1)
    text = text.replace(old, new, 1)

if "hasUsableVideo" in text:
    old = """        let videoStatus: \"live\" | \"reconnecting\" | \"offline\" | \"done\" = \"offline\";
        if (isDone) videoStatus = \"done\";
        else if (hasLiveVideo) videoStatus = \"live\";
        else if (isOnline(presence.lastSeenAt, now) || presence.cameraActive) videoStatus = \"reconnecting\";
        else videoStatus = \"offline\";
        return { a, presence, sev, name, matric, course, title, frame, camFrame, scrFrame, camLive, scrLive, hasLiveVideo, bars, isDone, activity, videoStatus };"""
    new = """        let videoStatus: \"live\" | \"reconnecting\" | \"offline\" | \"done\" = \"offline\";
        if (isDone) videoStatus = \"done\";
        else if (hasLiveVideo) videoStatus = \"live\";
        else if (hasUsableVideo || isOnline(presence.lastSeenAt, now) || presence.cameraActive) videoStatus = \"reconnecting\";
        else videoStatus = \"offline\";
        return { a, presence, sev, name, matric, course, title, frame, camFrame, scrFrame, camLive, scrLive, camUsable, scrUsable, hasLiveVideo, hasUsableVideo, bars, isDone, activity, videoStatus };"""
    if old in text:
        text = text.replace(old, new, 1)

if "courseName" not in text:
    old = """        const _c = a.examinations?.courses as unknown;
        const course = Array.isArray(_c)
          ? ((_c[0] as { code?: string } | undefined)?.code || \"—\")
          : ((_c as { code?: string } | null | undefined)?.code || \"—\");
        const title = a.examinations?.title || \"Exam\";"""
    new = """        const _c = a.examinations?.courses as unknown;
        const courseObj = Array.isArray(_c)
          ? (_c[0] as { code?: string; name?: string } | undefined)
          : (_c as { code?: string; name?: string } | null | undefined);
        const courseCode = String(courseObj?.code || \"\").trim();
        const courseName = String(courseObj?.name || \"\").trim();
        const course = courseCode && courseName && courseName.toLowerCase() !== courseCode.toLowerCase()
          ? `${courseCode} · ${courseName}`
          : (courseCode || courseName || \"—\");
        const title = a.examinations?.title || \"Exam\";"""
    if old in text:
        text = text.replace(old, new, 1)

if "isLiveCamFrameUsable(camF.ts)" not in text:
    old = """              const camLive = Boolean(camF && isLiveCamFrameFresh(camF.ts));
              const scrLive = Boolean(sf && isLiveScreenFrameFresh(sf.ts));
              const showCamFrame = Boolean(camF?.src) && !selected.isDone;
              const showScrFrame = Boolean(sf?.src) && !selected.isDone;"""
    new = """              const camLive = Boolean(camF && isLiveCamFrameFresh(camF.ts));
              const scrLive = Boolean(sf && isLiveScreenFrameFresh(sf.ts));
              const showCamFrame = Boolean(camF?.src && isLiveCamFrameUsable(camF.ts)) && !selected.isDone;
              const showScrFrame = Boolean(sf?.src && isLiveScreenFrameUsable(sf.ts)) && !selected.isDone;"""
    if old in text:
        text = text.replace(old, new, 1)

if "Camera reconnecting" not in text:
    old = """                          <p className=\"text-xs font-semibold text-white/90\">
                            {selected.isDone ? doneStatusLabel(selected.a.status) : \"Camera offline\"}
                          </p>"""
    new = """                          <p className=\"text-xs font-semibold text-white/90\">
                            {selected.isDone
                              ? doneStatusLabel(selected.a.status)
                              : selected.camUsable || selected.presence.cameraActive
                                ? \"Camera reconnecting…\"
                                : \"Camera offline\"}
                          </p>"""
    if old in text:
        text = text.replace(old, new, 1)

if 'pause: "pause"' not in text:
    old = """  async function officerControl(cmd: \"submit\" | \"hold\" | \"pause\" | \"release\" | \"terminate\") {
    if (!selected || !schoolId || actionBusy || selected.isDone) return;
    const labels = { submit: \"force-submit\", hold: \"hold/pause\", terminate: \"terminate\" } as const;
    if (!window.confirm(`Are you sure you want to ${labels[cmd]} this student's examination?`)) return;"""
    new = """  async function officerControl(cmd: \"submit\" | \"hold\" | \"pause\" | \"release\" | \"terminate\") {
    if (!selected || !schoolId || actionBusy || selected.isDone) return;
    const labels: Record<string, string> = {
      submit: \"force-submit\",
      hold: \"hold/pause\",
      pause: \"pause\",
      release: \"release\",
      terminate: \"terminate\",
    };
    if (!window.confirm(`Are you sure you want to ${labels[cmd] || cmd} this student's examination?`)) return;"""
    if old in text:
        text = text.replace(old, new, 1)

if '[\"paused\", \"held\"].includes' not in text and '["paused", "held"].includes' not in text:
    old = """                <Button size=\"sm\" variant=\"outline\" className=\"h-8 text-xs font-semibold\" disabled={actionBusy || warningBusy} onClick={() => void officerControl(\"submit\")}>
                  {actionBusy ? <Loader2 className=\"mr-1.5 h-3.5 w-3.5 animate-spin\" /> : null}
                  Submit Exam
                </Button>
                <Button size=\"sm\" variant=\"outline\" className=\"h-8 text-xs font-semibold\" disabled={actionBusy || warningBusy} onClick={() => void officerControl(\"pause\")}>
                  Pause Exam
                </Button>
                <Button size=\"sm\" variant=\"outline\" className=\"h-8 text-xs font-semibold\" disabled={actionBusy || warningBusy} onClick={() => void officerControl(\"release\")}>
                  Release Exam
                </Button>
                <Button size=\"sm\" variant=\"outline\" className=\"h-8 border-red-300 bg-red-50 text-xs font-semibold text-red-700 hover:bg-red-100\" disabled={actionBusy || warningBusy} onClick={() => void officerControl(\"terminate\")}>
                  Terminate Exam
                </Button>"""
    new = """                <Button size=\"sm\" variant=\"outline\" className=\"h-8 text-xs font-semibold\" disabled={actionBusy || warningBusy} onClick={() => void officerControl(\"submit\")}>
                  {actionBusy ? <Loader2 className=\"mr-1.5 h-3.5 w-3.5 animate-spin\" /> : null}
                  Submit Exam
                </Button>
                {[\"paused\", \"held\"].includes(String(selected.a.status || \"\").toLowerCase()) ? (
                  <Button size=\"sm\" variant=\"outline\" className=\"h-8 text-xs font-semibold\" disabled={actionBusy || warningBusy} onClick={() => void officerControl(\"release\")}>
                    Release Exam
                  </Button>
                ) : (
                  <Button size=\"sm\" variant=\"outline\" className=\"h-8 text-xs font-semibold\" disabled={actionBusy || warningBusy} onClick={() => void officerControl(\"pause\")}>
                    Pause Exam
                  </Button>
                )}
                <Button size=\"sm\" variant=\"outline\" className=\"h-8 border-red-300 bg-red-50 text-xs font-semibold text-red-700 hover:bg-red-100\" disabled={actionBusy || warningBusy} onClick={() => void officerControl(\"terminate\")}>
                  Terminate Exam
                </Button>"""
    if old in text:
        text = text.replace(old, new, 1)

text = text.replace(
  'streamLive={c.hasLiveVideo || Boolean(c.camLive || c.scrLive)}',
  'streamLive={c.hasLiveVideo || c.hasUsableVideo || Boolean(c.camLive || c.scrLive || c.camUsable || c.scrUsable)}',
)
text = text.replace(
  'frameSrc={c.camFrame?.src || c.frame?.src || c.scrFrame?.src}',
  'frameSrc={(c.camUsable && c.camFrame?.src) || (c.scrUsable && c.scrFrame?.src) || c.camFrame?.src || c.frame?.src || c.scrFrame?.src}',
)

if 'selected.camUsable || selected.camLive' not in text:
    old = '              <Info label="Camera" value={selected.presence.cameraActive ? "Active" : "Off"} />'
    new = '              <Info label="Camera" value={selected.presence.cameraActive || selected.camUsable || selected.camLive ? (selected.camLive ? "Active" : "Reconnecting") : "Off"} />'
    if old in text:
        text = text.replace(old, new, 1)

if "Sharing (delayed)" not in text:
    old = """              <Info
                label=\"Screen\"
                value={(() => {
                  const sf = screenFrames[selected.a.id] || screenFrames[`student:${selected.a.student_id}`];
                  if (sf && isLiveScreenFrameFresh(sf.ts)) return \"Sharing live\";
                  return \"Not sharing\";
                })()}
              />"""
    new = """              <Info
                label=\"Screen\"
                value={(() => {
                  const sf = screenFrames[selected.a.id] || screenFrames[`student:${selected.a.student_id}`];
                  if (sf && isLiveScreenFrameFresh(sf.ts)) return \"Sharing live\";
                  if (sf && isLiveScreenFrameUsable(sf.ts)) return \"Sharing (delayed)\";
                  return \"Not sharing\";
                })()}
              />"""
    if old in text:
        text = text.replace(old, new, 1)

if text == orig:
    print("No changes needed (already applied)")
    sys.exit(0)

TARGET.write_text(text, encoding="utf-8")
print("Patched", TARGET)
print("isLiveCamFrameUsable", text.count("isLiveCamFrameUsable"))
print("camUsable", text.count("camUsable"))
