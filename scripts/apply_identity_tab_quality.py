#!/usr/bin/env python3
"""Fix live name/matric/tab + modest video quality. Do not break camera/screen."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OM = ROOT / "src/routes/officer.live-monitor.tsx"
LV = ROOT / "src/lib/live-video.ts"
CAM = ROOT / "src/lib/use-live-cam-publish.ts"
SCR = ROOT / "src/lib/use-live-screen-publish.ts"
CBT = ROOT / "src/components/cbt/CbtExamSession.impl.tsx"

lv = LV.read_text()
lo = lv
lv = lv.replace(
    "const frame = await captureJpegFromStream(stream, { maxWidth: 280, quality: 0.42, mirror: true });",
    "const frame = await captureJpegFromStream(stream, { maxWidth: 320, quality: 0.55, mirror: true });",
)
lv = lv.replace(
    "export const LIVE_CAM_FRAME_INTERVAL_MS = 450;",
    "export const LIVE_CAM_FRAME_INTERVAL_MS = 350;",
)
lv = lv.replace(
    "export const LIVE_SCREEN_FRAME_INTERVAL_MS = 500;",
    "export const LIVE_SCREEN_FRAME_INTERVAL_MS = 400;",
)
lv = lv.replace(
    "maxWidth: 400,\n            quality: 0.32,",
    "maxWidth: 480,\n            quality: 0.42,",
)
lv = lv.replace("          const maxW = 400;", "          const maxW = 480;")
lv = lv.replace("              let q = 0.32;", "              let q = 0.42;")
lv = lv.replace(
    "if (frame.length > 220_000) {",
    "if (frame.length > 280_000) {",
)
if lv != lo:
    LV.write_text(lv)
    print("WRITTEN live-video quality")

cam = CAM.read_text()
if "intervalMs: 450," in cam:
    CAM.write_text(cam.replace("intervalMs: 450,", "intervalMs: 350,"))
    print("OK: cam 350ms")
scr = SCR.read_text()
if "intervalMs: 500," in scr:
    SCR.write_text(scr.replace("intervalMs: 500,", "intervalMs: 400,"))
    print("OK: screen 400ms")

cbt = CBT.read_text()
co = cbt

old_get_name = (
    'getStudentName: () => String((student as { fullName?: string } | null)?.fullName || session?.fullName || session?.identifier || "").trim() || null,'
)
new_get_name = (
    'getStudentName: () => {\n'
    '      const n = String(\n'
    '        (student as { fullName?: string } | null)?.fullName\n'
    '        || session?.fullName\n'
    '        || (student as { name?: string } | null)?.name\n'
    '        || ""\n'
    '      ).trim();\n'
    '      const mat = String((student as { matric?: string | null } | null)?.matric || session?.identifier || "").trim();\n'
    '      if (n && (!mat || n.toLowerCase() !== mat.toLowerCase())) return n;\n'
    '      return n || null;\n'
    '    },'
)
if old_get_name in cbt:
    cbt = cbt.replace(old_get_name, new_get_name, 1)
    print("OK: stronger getStudentName")

old_tab_upd = """      if (attemptIdRef.current) {
        void supabase.from("exam_attempts").update({
          tab_switch_count: tabSwitchCountRef.current,
        } as never).eq("id", attemptIdRef.current);
      }"""
new_tab_upd = """      if (attemptIdRef.current) {
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
      }"""
if old_tab_upd in cbt:
    cbt = cbt.replace(old_tab_upd, new_tab_upd, 1)
    print("OK: tab persist with identity")
else:
    print("FAIL: tab upd block")

if cbt != co:
    CBT.write_text(cbt)
    print("WRITTEN cbt")

om = OM.read_text()
oo = om

om = om.replace(
    """  const attemptsQ = useQuery({
    queryKey: ["officer-live-attempts", schoolId],
    enabled: Boolean(schoolId),
    refetchInterval: 6_000,""",
    """  const attemptsQ = useQuery({
    queryKey: ["officer-live-attempts", schoolId],
    enabled: Boolean(schoolId),
    refetchInterval: 3_000,""",
)
print("OK: attempts refetch 3s")

old_tab_presence = """          if (typeof statsFrame?.tabSwitchCount === "number") {
            (presence as { tabSwitchCount?: number }).tabSwitchCount = statsFrame.tabSwitchCount;
          }"""
new_tab_presence = """          if (typeof statsFrame?.tabSwitchCount === "number") {
            (presence as { tabSwitchCount?: number }).tabSwitchCount = statsFrame.tabSwitchCount;
          }
          const dbTab = Number(a.tab_switch_count ?? 0);
          const metaTab = (() => {
            const mm = a.metadata;
            if (!mm || typeof mm !== "object") return 0;
            return Number((mm as Record<string, unknown>).tabSwitchCount ?? 0);
          })();
          const liveTab = Number((presence as { tabSwitchCount?: number }).tabSwitchCount ?? 0);
          const bestTab = Math.max(dbTab, metaTab, liveTab);
          if (bestTab > 0) (presence as { tabSwitchCount?: number }).tabSwitchCount = bestTab;"""
if old_tab_presence in om:
    om = om.replace(old_tab_presence, new_tab_presence, 1)
    print("OK: live tab merge")
else:
    print("FAIL: tab presence")

if om != oo:
    OM.write_text(om)
    print("WRITTEN officer")
else:
    print("NO officer change")
print("ALL DONE")
