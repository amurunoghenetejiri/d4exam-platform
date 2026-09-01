#!/usr/bin/env python3
"""Surgical fix: officer live monitor remaining gaps (no UI redesign)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OM = ROOT / "src/routes/officer.live-monitor.tsx"
text = OM.read_text()
orig = text

# 1) Course: code + name
old_course = """        const _c = a.examinations?.courses as unknown;
        const course = Array.isArray(_c)
          ? ((_c[0] as { code?: string } | undefined)?.code || \"\u2014\")
          : ((_c as { code?: string } | null | undefined)?.code || \"\u2014\");"""
# Use actual em-dash from file
old_course = '''        const _c = a.examinations?.courses as unknown;
        const course = Array.isArray(_c)
          ? ((_c[0] as { code?: string } | undefined)?.code || "\u2014")
          : ((_c as { code?: string } | null | undefined)?.code || "\u2014");'''
old_course = old_course.replace("\\u2014", "\u2014")
new_course = '''        const _c = a.examinations?.courses as unknown;
        const courseObj = Array.isArray(_c)
          ? (_c[0] as { code?: string; name?: string } | undefined)
          : (_c as { code?: string; name?: string } | null | undefined);
        const courseCode = String(courseObj?.code || "").trim();
        const courseName = String(courseObj?.name || "").trim();
        const course = courseCode && courseName && courseName.toLowerCase() !== courseCode.toLowerCase()
          ? `${courseCode} \u00b7 ${courseName}`
          : (courseCode || courseName || "\u2014");'''
new_course = new_course.replace("\\u00b7", "\u00b7").replace("\\u2014", "\u2014")
if old_course in text:
    text = text.replace(old_course, new_course, 1)
    print("OK: course code name")
else:
    print("SKIP: course already patched or mismatch")

# 2) Grid StudentCard frameSrc + streamLive keep last frame visible
old_card = '''                  frameSrc={c.camFrame?.src || c.frame?.src || c.scrFrame?.src}
                  streamLive={c.hasLiveVideo || Boolean(c.camLive || c.scrLive)}'''
new_card = '''                  frameSrc={c.camFrame?.src || c.scrFrame?.src || c.frame?.src}
                  streamLive={c.hasLiveVideo || Boolean(c.camLive || c.scrLive) || Boolean(c.camFrame?.src || c.scrFrame?.src)}'''
if old_card in text:
    text = text.replace(old_card, new_card, 1)
    print("OK: grid frame keep last")
else:
    print("SKIP: grid frame already patched")

# 3) Pause/Release toggle in UI
old_btns = '''                <Button size="sm" variant="outline" className="h-8 text-xs font-semibold" disabled={actionBusy || warningBusy} onClick={() => void officerControl("pause")}>
                  Pause Exam
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs font-semibold" disabled={actionBusy || warningBusy} onClick={() => void officerControl("release")}>
                  Release Exam
                </Button>'''
new_btns = '''                {["paused", "held"].includes(String(selected.a.status || "").toLowerCase()) ? (
                  <Button size="sm" variant="outline" className="h-8 text-xs font-semibold" disabled={actionBusy || warningBusy} onClick={() => void officerControl("release")}>
                    Release Exam
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="h-8 text-xs font-semibold" disabled={actionBusy || warningBusy} onClick={() => void officerControl("pause")}>
                    Pause Exam
                  </Button>
                )}'''
if old_btns in text:
    text = text.replace(old_btns, new_btns, 1)
    print("OK: Pause/Release toggle")
else:
    print("SKIP: Pause/Release already toggled or mismatch")

# 4) Fix confirm labels for pause/release
old_labels = '''    const labels = { submit: "force-submit", hold: "hold/pause", terminate: "terminate" } as const;
    if (!window.confirm(`Are you sure you want to ${labels[cmd]} this student's examination?`)) return;'''
new_labels = '''    const labels: Record<string, string> = {
      submit: "force-submit",
      hold: "hold/pause",
      pause: "pause",
      release: "release",
      terminate: "terminate",
    };
    if (!window.confirm(`Are you sure you want to ${labels[cmd] || cmd} this student's examination?`)) return;'''
if old_labels in text:
    text = text.replace(old_labels, new_labels, 1)
    print("OK: confirm labels")
else:
    print("SKIP: labels already fixed")

# 5) Camera status in focus uses live/usable
old_cam_info = '<Info label="Camera" value={selected.presence.cameraActive ? "Active" : "Off"} />'
new_cam_info = '<Info label="Camera" value={selected.camLive ? "Active" : (selected.presence.cameraActive || (selected.camFrame?.src && isLiveCamFrameUsable(selected.camFrame.ts)) ? "Reconnecting" : "Off")} />'
if old_cam_info in text:
    text = text.replace(old_cam_info, new_cam_info, 1)
    print("OK: camera status usable")
else:
    print("SKIP: camera info already patched")

# 6) Screen status uses usable
old_scr = '''              <Info
                label="Screen"
                value={(() => {
                  const sf = screenFrames[selected.a.id] || screenFrames[`student:${selected.a.student_id}`];
                  if (sf && isLiveScreenFrameFresh(sf.ts)) return "Sharing live";
                  return "Not sharing";
                })()}
              />'''
new_scr = '''              <Info
                label="Screen"
                value={(() => {
                  const sf = screenFrames[selected.a.id] || screenFrames[`student:${selected.a.student_id}`];
                  if (sf && isLiveScreenFrameFresh(sf.ts)) return "Sharing live";
                  if (sf && isLiveScreenFrameUsable(sf.ts)) return "Sharing (delayed)";
                  return "Not sharing";
                })()}
              />'''
if old_scr in text:
    text = text.replace(old_scr, new_scr, 1)
    print("OK: screen delayed status")
else:
    print("SKIP: screen status already patched")

if text == orig:
    print("NO CHANGES")
else:
    OM.write_text(text)
    print("WRITTEN", OM)
