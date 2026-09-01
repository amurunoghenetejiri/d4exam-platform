#!/usr/bin/env python3
"""Fix live name/matric/tab + modest video quality. Do not break camera/screen. v2"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
OM = ROOT / "src/routes/officer.live-monitor.tsx"
LV = ROOT / "src/lib/live-video.ts"
CAM = ROOT / "src/lib/use-live-cam-publish.ts"
SCR = ROOT / "src/lib/use-live-screen-publish.ts"
CBT = ROOT / "src/components/cbt/CbtExamSession.impl.tsx"

lv = LV.read_text()
lo = lv
for a, b in [
    ("export const LIVE_CAM_FRAME_INTERVAL_MS = 450;", "export const LIVE_CAM_FRAME_INTERVAL_MS = 350;"),
    ("export const LIVE_CAM_FRAME_INTERVAL_MS = 900;", "export const LIVE_CAM_FRAME_INTERVAL_MS = 350;"),
    ("export const LIVE_SCREEN_FRAME_INTERVAL_MS = 500;", "export const LIVE_SCREEN_FRAME_INTERVAL_MS = 400;"),
    ("export const LIVE_SCREEN_FRAME_INTERVAL_MS = 700;", "export const LIVE_SCREEN_FRAME_INTERVAL_MS = 400;"),
    (
        "const frame = await captureJpegFromStream(stream, { maxWidth: 280, quality: 0.42, mirror: true });",
        "const frame = await captureJpegFromStream(stream, { maxWidth: 320, quality: 0.55, mirror: true });",
    ),
    (
        "const frame = await captureJpegFromStream(stream, { maxWidth: 360, quality: 0.52, mirror: true });",
        "const frame = await captureJpegFromStream(stream, { maxWidth: 320, quality: 0.55, mirror: true });",
    ),
    ("maxWidth: 400,\n            quality: 0.32,", "maxWidth: 480,\n            quality: 0.42,"),
    ("maxWidth: 520,\n            quality: 0.38,", "maxWidth: 480,\n            quality: 0.42,"),
    ("          const maxW = 400;", "          const maxW = 480;"),
    ("          const maxW = 520;", "          const maxW = 480;"),
    ("              let q = 0.32;", "              let q = 0.42;"),
    ("              let q = 0.38;", "              let q = 0.42;"),
    ("if (frame.length > 220_000) {", "if (frame.length > 280_000) {"),
]:
    if a in lv:
        lv = lv.replace(a, b)
        print("lv:", a[:40])
if lv != lo:
    LV.write_text(lv)
    print("WRITTEN live-video")

for path, olds, new in [
    (CAM, ["intervalMs: 450,", "intervalMs: 600,"], "intervalMs: 350,"),
    (SCR, ["intervalMs: 500,", "intervalMs: 700,"], "intervalMs: 400,"),
]:
    t = path.read_text()
    for o in olds:
        if o in t:
            path.write_text(t.replace(o, new))
            print("OK", path.name, new)
            break

cbt = CBT.read_text()
co = cbt
pat = re.compile(
    r"if \(attemptIdRef\.current\) \{\s*void supabase\.from\(\"exam_attempts\"\)\.update\(\{\s*tab_switch_count: tabSwitchCountRef\.current,\s*\} as never\)\.eq\(\"id\", attemptIdRef\.current\);\s*\}",
    re.M,
)
repl = '''if (attemptIdRef.current) {
        void (async () => {
          try {
            const aid = attemptIdRef.current!;
            const { data: prevRow } = await supabase.from("exam_attempts").select("metadata").eq("id", aid).maybeSingle();
            const prevMeta = prevRow?.metadata && typeof prevRow.metadata === "object" && !Array.isArray(prevRow.metadata)
              ? (prevRow.metadata as Record<string, unknown>)
              : {};
            await supabase.from("exam_attempts").update({
              tab_switch_count: tabSwitchCountRef.current,
              metadata: {
                ...prevMeta,
                tabSwitchCount: tabSwitchCountRef.current,
                lastSeenAt: new Date().toISOString(),
                studentName: String((student as { fullName?: string } | null)?.fullName || session?.fullName || prevMeta.studentName || "").trim() || prevMeta.studentName,
                matricNumber: String((student as { matric?: string | null } | null)?.matric || session?.identifier || prevMeta.matricNumber || "").trim() || prevMeta.matricNumber,
              },
              updated_at: new Date().toISOString(),
            } as never).eq("id", aid);
          } catch (e) {
            console.warn("[cbt] tab_switch persist", e);
          }
        })();
      }'''
if pat.search(cbt):
    cbt = pat.sub(repl, cbt, count=1)
    print("OK: tab persist")
else:
    print("FAIL: tab block regex")

if cbt != co:
    CBT.write_text(cbt)
    print("WRITTEN cbt")

om = OM.read_text()
oo = om
om2 = re.sub(
    r'(queryKey: \["officer-live-attempts", schoolId\],[^\]]*?refetchInterval: )\d+_000',
    r'\g<1>3_000',
    om,
    count=1,
    flags=re.S,
)
if om2 != om:
    om = om2
    print("OK: attempts 3s")

if "const bestTab = Math.max" not in om:
    needle = '''          if (typeof statsFrame?.tabSwitchCount === "number") {
            (presence as { tabSwitchCount?: number }).tabSwitchCount = statsFrame.tabSwitchCount;
          }'''
    add = '''          if (typeof statsFrame?.tabSwitchCount === "number") {
            (presence as { tabSwitchCount?: number }).tabSwitchCount = statsFrame.tabSwitchCount;
          }
          {
            const dbTab = Number(a.tab_switch_count ?? 0);
            const metaTab = (() => {
              const mm = a.metadata;
              if (!mm || typeof mm !== "object") return 0;
              return Number((mm as Record<string, unknown>).tabSwitchCount ?? 0);
            })();
            const liveTab = Number((presence as { tabSwitchCount?: number }).tabSwitchCount ?? 0);
            const bestTab = Math.max(dbTab, metaTab, liveTab);
            if (bestTab > 0) (presence as { tabSwitchCount?: number }).tabSwitchCount = bestTab;
          }'''
    if needle in om:
        om = om.replace(needle, add, 1)
        print("OK: bestTab")
    else:
        print("FAIL: tab presence needle")

if om != oo:
    OM.write_text(om)
    print("WRITTEN officer")
print("ALL DONE")
