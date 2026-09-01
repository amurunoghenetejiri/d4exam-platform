#!/usr/bin/env python3
"""Surgical: hysteresis for live-video + officer.live-monitor usable frames."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
lv = ROOT / "src/lib/live-video.ts"
om = ROOT / "src/routes/officer.live-monitor.tsx"

t = lv.read_text()
changed = False

if "LIVE_CAM_DISPLAY_MS" not in t:
    t = t.replace(
        "export const LIVE_CAM_STALE_MS = 8_000;",
        '/** LIVE badge / "fresh" — tolerate Realtime jitter without false OFF */\nexport const LIVE_CAM_STALE_MS = 22_000;\n/** Keep last frame visible through packet loss; only then treat as offline */\nexport const LIVE_CAM_DISPLAY_MS = 90_000;',
        1,
    )
    changed = True
elif "LIVE_CAM_STALE_MS = 8_000" in t:
    t = t.replace("LIVE_CAM_STALE_MS = 8_000", "LIVE_CAM_STALE_MS = 22_000")
    changed = True

if "isLiveCamFrameUsable" not in t:
    needle = """export function isLiveCamFrameFresh(ts: number | null | undefined, now = Date.now()): boolean {
  if (ts == null) return false;
  return now - ts <= LIVE_CAM_STALE_MS;
}"""
    insert = needle + """

/** Still show last frame (hysteresis) — do NOT treat brief packet loss as Camera Off */
export function isLiveCamFrameUsable(ts: number | null | undefined, now = Date.now()): boolean {
  if (ts == null) return false;
  return now - ts <= LIVE_CAM_DISPLAY_MS;
}"""
    if needle in t:
        t = t.replace(needle, insert, 1)
        changed = True

if "LIVE_SCREEN_DISPLAY_MS" not in t:
    t = t.replace(
        "export const LIVE_SCREEN_STALE_MS = 8_000;",
        "export const LIVE_SCREEN_STALE_MS = 22_000;\nexport const LIVE_SCREEN_DISPLAY_MS = 90_000;",
        1,
    )
    changed = True
elif "LIVE_SCREEN_STALE_MS = 8_000" in t:
    t = t.replace("LIVE_SCREEN_STALE_MS = 8_000", "LIVE_SCREEN_STALE_MS = 22_000")
    changed = True

if "isLiveScreenFrameUsable" not in t:
    needle = """export function isLiveScreenFrameFresh(ts: number | null | undefined, now = Date.now()): boolean {
  if (ts == null) return false;
  return now - ts <= LIVE_SCREEN_STALE_MS;
}"""
    insert = needle + """

export function isLiveScreenFrameUsable(ts: number | null | undefined, now = Date.now()): boolean {
  if (ts == null) return false;
  return now - ts <= LIVE_SCREEN_DISPLAY_MS;
}"""
    if needle in t:
        t = t.replace(needle, insert, 1)
        changed = True

if changed:
    lv.write_text(t)
    print("patched live-video.ts")
else:
    print("live-video.ts already OK")

# officer.live-monitor.tsx
t2 = om.read_text()
c2 = False
if "isLiveCamFrameUsable" not in t2:
    t2 = t2.replace(
        """import {
  isLiveCamFrameFresh,
  startLiveCamSubscriber,
  LIVE_CAM_STALE_MS,
  type LiveCamFramePayload,
  startLiveScreenSubscriber,
  isLiveScreenFrameFresh,
  type LiveScreenFramePayload,
} from \"@/lib/live-video\";""",
        """import {
  isLiveCamFrameFresh,
  isLiveCamFrameUsable,
  startLiveCamSubscriber,
  LIVE_CAM_STALE_MS,
  type LiveCamFramePayload,
  startLiveScreenSubscriber,
  isLiveScreenFrameFresh,
  isLiveScreenFrameUsable,
  type LiveScreenFramePayload,
} from \"@/lib/live-video\";""",
        1,
    )
    c2 = True

old_live = """        const camLive = Boolean(camFrame && isLiveCamFrameFresh(camFrame.ts, now));
        const scrLive = Boolean(scrFrame && isLiveScreenFrameFresh(scrFrame.ts, now));
        const hasLiveVideo = !isDone && (
          feedMode === \"screen\" ? scrLive : feedMode === \"camera\" ? camLive : (camLive || scrLive)
        );
        // Prefer live Realtime frame — never show offline while video frames are arriving
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

new_live = """        const camLive = Boolean(camFrame && isLiveCamFrameFresh(camFrame.ts, now));
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

if \"camUsable\" not in t2 and old_live in t2:
    t2 = t2.replace(old_live, new_live, 1)
    c2 = True

old_course = """        const _c = a.examinations?.courses as unknown;
        const course = Array.isArray(_c)
          ? ((_c[0] as { code?: string } | undefined)?.code || \"—\")
          : ((_c as { code?: string } | null | undefined)?.code || \"—\");"""
new_course = """        const _c = a.examinations?.courses as unknown;
        const courseObj = Array.isArray(_c)
          ? (_c[0] as { code?: string; name?: string } | undefined)
          : (_c as { code?: string; name?: string } | null | undefined);
        const courseCode = String(courseObj?.code || \"\").trim();
        const courseName = String(courseObj?.name || \"\").trim();
        const course = courseCode && courseName && courseName.toLowerCase() !== courseCode.toLowerCase()
          ? `${courseCode} · ${courseName}`
          : (courseCode || courseName || \"—\");"""
if \"courseObj\" not in t2 and old_course in t2:
    t2 = t2.replace(old_course, new_course, 1)
    c2 = True

old_vs = """        let videoStatus: \"live\" | \"reconnecting\" | \"offline\" | \"done\" = \"offline\";
        if (isDone) videoStatus = \"done\";
        else if (hasLiveVideo) videoStatus = \"live\";
        else if (isOnline(presence.lastSeenAt, now) || presence.cameraActive) videoStatus = \"reconnecting\";
        else videoStatus = \"offline\";
        return { a, presence, sev, name, matric, course, title, frame, camFrame, scrFrame, camLive, scrLive, hasLiveVideo, bars, isDone, activity, videoStatus };"""
new_vs = """        let videoStatus: \"live\" | \"reconnecting\" | \"offline\" | \"done\" = \"offline\";
        if (isDone) videoStatus = \"done\";
        else if (hasLiveVideo) videoStatus = \"live\";
        else if (hasUsableVideo || isOnline(presence.lastSeenAt, now) || presence.cameraActive) videoStatus = \"reconnecting\";
        else videoStatus = \"offline\";
        return { a, presence, sev, name, matric, course, title, frame, camFrame, scrFrame, camLive, scrLive, camUsable, scrUsable, hasLiveVideo, hasUsableVideo, bars, isDone, activity, videoStatus };"""
if \"hasUsableVideo\" not in t2 and old_vs in t2:
    t2 = t2.replace(old_vs, new_vs, 1)
    c2 = True

old_card = """                  frameSrc={c.camFrame?.src || c.frame?.src || c.scrFrame?.src}
                  streamLive={c.hasLiveVideo || Boolean(c.camLive || c.scrLive)}"""
new_card = """                  frameSrc={(c.camUsable && c.camFrame?.src) || (c.scrUsable && c.scrFrame?.src) || c.camFrame?.src || c.frame?.src || c.scrFrame?.src}
                  streamLive={c.hasLiveVideo || c.hasUsableVideo || Boolean(c.camLive || c.scrLive || c.camUsable || c.scrUsable)}"""
if \"c.camUsable\" not in t2 and old_card in t2:
    t2 = t2.replace(old_card, new_card, 1)
    c2 = True

old_show = """              const camLive = Boolean(camF && isLiveCamFrameFresh(camF.ts));
              const scrLive = Boolean(sf && isLiveScreenFrameFresh(sf.ts));
              const showCamFrame = Boolean(camF?.src) && !selected.isDone;
              const showScrFrame = Boolean(sf?.src) && !selected.isDone;"""
new_show = """              const camLive = Boolean(camF && isLiveCamFrameFresh(camF.ts));
              const scrLive = Boolean(sf && isLiveScreenFrameFresh(sf.ts));
              const showCamFrame = Boolean(camF?.src && isLiveCamFrameUsable(camF.ts)) && !selected.isDone;
              const showScrFrame = Boolean(sf?.src && isLiveScreenFrameUsable(sf.ts)) && !selected.isDone;"""
if \"isLiveCamFrameUsable(camF.ts)\" not in t2 and old_show in t2:
    t2 = t2.replace(old_show, new_show, 1)
    c2 = True

old_off = """                          <p className=\"text-xs font-semibold text-white/90\">
                            {selected.isDone ? doneStatusLabel(selected.a.status) : \"Camera offline\"}
                          </p>"""
new_off = """                          <p className=\"text-xs font-semibold text-white/90\">
                            {selected.isDone
                              ? doneStatusLabel(selected.a.status)
                              : selected.camUsable || selected.presence.cameraActive
                                ? \"Camera reconnecting…\"
                                : \"Camera offline\"}
                          </p>"""
if \"Camera reconnecting\" not in t2 and old_off in t2:
    t2 = t2.replace(old_off, new_off, 1)
    c2 = True

old_cam_info = '              <Info label=\"Camera\" value={selected.presence.cameraActive ? \"Active\" : \"Off\"} />'
new_cam_info = '              <Info label=\"Camera\" value={selected.presence.cameraActive || selected.camUsable || selected.camLive ? (selected.camLive ? \"Active\" : \"Reconnecting\") : \"Off\"} />'
if old_cam_info in t2:
    t2 = t2.replace(old_cam_info, new_cam_info, 1)
    c2 = True

old_scr_info = """              <Info
                label=\"Screen\"
                value={(() => {
                  const sf = screenFrames[selected.a.id] || screenFrames[`student:${selected.a.student_id}`];
                  if (sf && isLiveScreenFrameFresh(sf.ts)) return \"Sharing live\";
                  return \"Not sharing\";
                })()}
              />"""
new_scr_info = """              <Info
                label=\"Screen\"
                value={(() => {
                  const sf = screenFrames[selected.a.id] || screenFrames[`student:${selected.a.student_id}`];
                  if (sf && isLiveScreenFrameFresh(sf.ts)) return \"Sharing live\";
                  if (sf && isLiveScreenFrameUsable(sf.ts)) return \"Sharing (delayed)\";
                  return \"Not sharing\";
                })()}
              />"""
if \"Sharing (delayed)\" not in t2 and old_scr_info in t2:
    t2 = t2.replace(old_scr_info, new_scr_info, 1)
    c2 = True

old_btns = """                <Button size=\"sm\" variant=\"outline\" className=\"h-8 text-xs font-semibold\" disabled={actionBusy || warningBusy} onClick={() => void officerControl(\"pause\")}>
                  Pause Exam
                </Button>
                <Button size=\"sm\" variant=\"outline\" className=\"h-8 text-xs font-semibold\" disabled={actionBusy || warningBusy} onClick={() => void officerControl(\"release\")}>
                  Release Exam
                </Button>"""
new_btns = """                {[\"paused\", \"held\"].includes(String(selected.a.status || \"\").toLowerCase()) ? (
                  <Button size=\"sm\" variant=\"outline\" className=\"h-8 text-xs font-semibold\" disabled={actionBusy || warningBusy} onClick={() => void officerControl(\"release\")}>
                    Release Exam
                  </Button>
                ) : (
                  <Button size=\"sm\" variant=\"outline\" className=\"h-8 text-xs font-semibold\" disabled={actionBusy || warningBusy} onClick={() => void officerControl(\"pause\")}>
                    Pause Exam
                  </Button>
                )}"""
if '[\"paused\", \"held\"]' not in t2 and old_btns in t2:
    t2 = t2.replace(old_btns, new_btns, 1)
    c2 = True

old_labels = """    const labels = { submit: \"force-submit\", hold: \"hold/pause\", terminate: \"terminate\" } as const;
    if (!window.confirm(`Are you sure you want to ${labels[cmd]} this student's examination?`)) return;"""
new_labels = """    const labels: Record<string, string> = {
      submit: \"force-submit\",
      hold: \"hold/pause\",
      pause: \"pause\",
      release: \"release\",
      terminate: \"terminate\",
    };
    if (!window.confirm(`Are you sure you want to ${labels[cmd] || cmd} this student's examination?`)) return;"""
if 'pause: \"pause\"' not in t2 and old_labels in t2:
    t2 = t2.replace(old_labels, new_labels, 1)
    c2 = True

if c2:
    om.write_text(t2)
    print(\"patched officer.live-monitor.tsx\")
else:
    print(\"officer.live-monitor.tsx: check status\")
    for name, present in [
        (\"camUsable\", \"camUsable\" in t2),
        (\"isLiveCamFrameUsable\", \"isLiveCamFrameUsable\" in t2),
        (\"courseObj\", \"courseObj\" in t2),
        (\"hasUsableVideo\", \"hasUsableVideo\" in t2),
        (\"Camera reconnecting\", \"Camera reconnecting\" in t2),
        (\"pause toggle\", '[\"paused\", \"held\"]' in t2),
    ]:
        print(f\"  {name}: {present}\")
