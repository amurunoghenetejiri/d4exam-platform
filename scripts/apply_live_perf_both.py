#!/usr/bin/env python3
"""Optimize live frames + BOTH mode cards + identity. No UI redesign."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LV = ROOT / "src/lib/live-video.ts"
OM = ROOT / "src/routes/officer.live-monitor.tsx"
CAM = ROOT / "src/lib/use-live-cam-publish.ts"
SCR = ROOT / "src/lib/use-live-screen-publish.ts"

lv = LV.read_text()
orig = lv

lv = lv.replace(
    "export const LIVE_CAM_FRAME_INTERVAL_MS = 900;",
    "export const LIVE_CAM_FRAME_INTERVAL_MS = 450;",
)
lv = lv.replace(
    "export const LIVE_SCREEN_FRAME_INTERVAL_MS = 700;",
    "export const LIVE_SCREEN_FRAME_INTERVAL_MS = 500;",
)
lv = lv.replace(
    "  const t0 = video.currentTime;\n  await new Promise((r) => window.setTimeout(r, 40));",
    "  const t0 = video.currentTime;\n  await new Promise((r) => window.setTimeout(r, 16));",
)
lv = lv.replace(
    "const frame = await captureJpegFromStream(stream, { maxWidth: 360, quality: 0.52, mirror: true });",
    "const frame = await captureJpegFromStream(stream, { maxWidth: 280, quality: 0.42, mirror: true });",
)
old_scr_get = (
    "      let frame = await awaitLatestNativeScreenJpeg();\n"
    "      if (!frame) {\n"
    "        frame = getLatestNativeScreenJpeg();\n"
    "      }"
)
new_scr_get = (
    "      let frame = getLatestNativeScreenJpeg();\n"
    "      if (!frame) {\n"
    "        frame = await awaitLatestNativeScreenJpeg();\n"
    "      }"
)
if old_scr_get in lv:
    lv = lv.replace(old_scr_get, new_scr_get, 1)
    print("OK: screen prefer cache")
lv = lv.replace(
    'if (typeof document !== "undefined" && frame.length > 40_000) {',
    'if (typeof document !== "undefined" && frame.length > 90_000) {',
)
lv = lv.replace(
    "maxWidth: 520,\n            quality: 0.38,",
    "maxWidth: 400,\n            quality: 0.32,",
)
lv = lv.replace("          const maxW = 520;", "          const maxW = 400;")
lv = lv.replace("              let q = 0.38;", "              let q = 0.32;")
lv = lv.replace(
    "export const LIVE_CAM_STALE_MS = 22_000;",
    "export const LIVE_CAM_STALE_MS = 4_500;",
)
lv = lv.replace(
    "export const LIVE_SCREEN_STALE_MS = 22_000;",
    "export const LIVE_SCREEN_STALE_MS = 4_500;",
)

if lv != orig:
    LV.write_text(lv)
    print("WRITTEN live-video")
else:
    print("NO live-video change")

cam = CAM.read_text()
if "intervalMs: 600," in cam:
    CAM.write_text(cam.replace("intervalMs: 600,", "intervalMs: 450,"))
    print("OK: cam interval")
scr = SCR.read_text()
if "intervalMs: 700," in scr:
    SCR.write_text(scr.replace("intervalMs: 700,", "intervalMs: 500,"))
    print("OK: screen interval")

om = OM.read_text()
oo = om

old_bars = (
    "  if (frameAge <= 2_500) return 4;\n"
    "  if (frameAge <= 5_000) return 3;\n"
    "  if (frameAge <= LIVE_CAM_STALE_MS || seenAge <= 15_000) return 2;\n"
    "  if (seenAge <= 45_000) return 1;\n"
    "  return 0;"
)
new_bars = (
    "  if (frameAge <= 1_200) return 4;\n"
    "  if (frameAge <= 2_500) return 3;\n"
    "  if (frameAge <= LIVE_CAM_STALE_MS || seenAge <= 8_000) return 2;\n"
    "  if (seenAge <= 25_000) return 1;\n"
    "  return 0;"
)
if old_bars in om:
    om = om.replace(old_bars, new_bars, 1)
    print("OK: signal bars")

old_sc_sig = """function StudentCard({
  name,
  matric,
  course,
  sev,
  presence,
  frameSrc,
  streamLive,
  bars,
  isDone,
  statusLabel,
  onClick,
}: {
  name: string;
  matric: string;
  course: string;
  sev: MonitorSeverity;
  presence: ReturnType<typeof parsePresence>;
  frameSrc?: string;
  streamLive?: boolean;
  bars: number;
  isDone?: boolean;
  statusLabel?: string;
  onClick: () => void;
}) {"""

new_sc_sig = """function StudentCard({
  name,
  matric,
  course,
  sev,
  presence,
  frameSrc,
  camSrc,
  scrSrc,
  feedMode = \"camera\",
  streamLive,
  bars,
  isDone,
  statusLabel,
  onClick,
}: {
  name: string;
  matric: string;
  course: string;
  sev: MonitorSeverity;
  presence: ReturnType<typeof parsePresence>;
  frameSrc?: string;
  camSrc?: string;
  scrSrc?: string;
  feedMode?: \"camera\" | \"screen\" | \"both\";
  streamLive?: boolean;
  bars: number;
  isDone?: boolean;
  statusLabel?: string;
  onClick: () => void;
}) {"""

if old_sc_sig in om:
    om = om.replace(old_sc_sig, new_sc_sig, 1)
    print("OK: StudentCard props")
else:
    print("FAIL: StudentCard sig")

old_media = """        ) : frameSrc ? (
          <img src={frameSrc} alt=\"\" className=\"h-full w-full object-cover\" />
        ) : (
          <div className=\"flex h-full items-center justify-center\">
            <UserRound className=\"h-7 w-7 text-white/25 sm:h-10 sm:w-10\" />
          </div>
        )}"""

new_media = """        ) : feedMode === \"both\" && (camSrc || scrSrc) ? (
          <div className=\"flex h-full w-full\">
            <div className=\"relative h-full w-1/2 overflow-hidden border-r border-white/10\">
              {camSrc ? (
                <img src={camSrc} alt=\"\" className=\"h-full w-full object-cover\" />
              ) : (
                <div className=\"grid h-full place-items-center bg-slate-900\">
                  <UserRound className=\"h-5 w-5 text-white/25\" />
                </div>
              )}
            </div>
            <div className=\"relative h-full w-1/2 overflow-hidden\">
              {scrSrc ? (
                <img src={scrSrc} alt=\"\" className=\"h-full w-full object-contain bg-black\" />
              ) : (
                <div className=\"grid h-full place-items-center bg-slate-950\">
                  <Monitor className=\"h-5 w-5 text-white/25\" />
                </div>
              )}
            </div>
          </div>
        ) : frameSrc ? (
          <img src={frameSrc} alt=\"\" className=\"h-full w-full object-cover\" />
        ) : (
          <div className=\"flex h-full items-center justify-center\">
            <UserRound className=\"h-7 w-7 text-white/25 sm:h-10 sm:w-10\" />
          </div>
        )}"""

if old_media in om:
    om = om.replace(old_media, new_media, 1)
    print("OK: dual media")
else:
    print("FAIL: dual media")

old_pass = """                <StudentCard
                  key={c.a.id}
                  name={c.name}
                  matric={c.matric}
                  course={c.course}
                  sev={c.sev}
                  presence={c.presence}
                  frameSrc={c.camFrame?.src || c.scrFrame?.src || c.frame?.src}
                  streamLive={c.hasLiveVideo || Boolean(c.camLive || c.scrLive) || Boolean(c.camFrame?.src || c.scrFrame?.src)}
                  bars={c.bars}
                  isDone={c.isDone}
                  statusLabel={c.isDone ? doneStatusLabel(c.a.status) : undefined}
                  onClick={() => setSelectedId(c.a.id)}
                />"""

new_pass = """                <StudentCard
                  key={c.a.id}
                  name={c.name}
                  matric={c.matric}
                  course={c.course}
                  sev={c.sev}
                  presence={c.presence}
                  frameSrc={
                    feedMode === \"screen\"
                      ? (c.scrFrame?.src || c.frame?.src)
                      : feedMode === \"camera\"
                        ? (c.camFrame?.src || c.frame?.src)
                        : (c.camFrame?.src || c.scrFrame?.src || c.frame?.src)
                  }
                  camSrc={c.camFrame?.src}
                  scrSrc={c.scrFrame?.src}
                  feedMode={feedMode}
                  streamLive={c.hasLiveVideo || Boolean(c.camLive || c.scrLive) || Boolean(c.camFrame?.src || c.scrFrame?.src)}
                  bars={c.bars}
                  isDone={c.isDone}
                  statusLabel={c.isDone ? doneStatusLabel(c.a.status) : undefined}
                  onClick={() => setSelectedId(c.a.id)}
                />"""

if old_pass in om:
    om = om.replace(old_pass, new_pass, 1)
    print("OK: grid pass")
else:
    print("FAIL: grid pass")

om = om.replace(
    'dual ? "grid grid-cols-1 sm:grid-cols-[1.35fr_1fr]" : "grid grid-cols-1"',
    'dual ? "grid grid-cols-2" : "grid grid-cols-1"',
)
om = om.replace(
    '"relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-900 shadow-inner ring-1 ring-black/10"',
    '"relative aspect-[4/3] max-h-[28vh] overflow-hidden rounded-xl bg-slate-900 shadow-inner ring-1 ring-black/10 sm:max-h-[32vh]"',
)
om = om.replace(
    '"relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-950 shadow-inner ring-1 ring-black/10"',
    '"relative aspect-[4/3] max-h-[28vh] overflow-hidden rounded-xl bg-slate-950 shadow-inner ring-1 ring-black/10 sm:max-h-[32vh]"',
)
print("OK: focus compact")

old_name = "        const name = (resolved && resolved.trim()) || studentDisplayName(a);"
if old_name in om:
    om = om.replace(
        old_name,
        "        const metaName = nameFromMetadata(a.metadata);\n"
        "        const name = (resolved && String(resolved).trim()) || metaName || studentDisplayName(a);",
        1,
    )
    print("OK: name prefer meta")

idx = om.find("const metaMatric = (() => {")
if idx > 0:
    midx = om.find("const matric = String(", idx)
    if midx > 0 and "metaMatric" not in om[midx : midx + 150]:
        end = om.find(";", midx) + 1
        om = (
            om[:midx]
            + 'const matric = String(a.students?.matric_number || a.students?.student_id || metaMatric || "").trim() || "\u2014";'.replace(
                "\\u2014", "\u2014"
            )
            + om[end:]
        )
        print("OK: matric uses metaMatric")

if om != oo:
    OM.write_text(om)
    print("WRITTEN officer")
else:
    print("NO officer change")
print("ALL DONE")
