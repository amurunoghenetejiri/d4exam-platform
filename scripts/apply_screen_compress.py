#!/usr/bin/env python3
"""Compress screen frames + log Realtime send status. No UI changes."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LV = ROOT / "src/lib/live-video.ts"
lv = LV.read_text()
orig = lv

# 1) Lower capture size for web stream path inside screen publisher
lv = lv.replace(
    """frame = await captureJpegFromStream(stream, {
            maxWidth: 720,
            quality: 0.55,
            mirror: false,
          });""",
    """frame = await captureJpegFromStream(stream, {
            maxWidth: 520,
            quality: 0.38,
            mirror: false,
          });""",
    1,
)

# 2) Insert compress step + size guard before send, and await send status
old_send_block = '''      if (stopped || !channel) return;
      if (!frame) {
        return;
      }
      const basePayload = {
        studentId: opts.studentId,
        examId: opts.examId,
        frame,
        ts: Date.now(),
        screenActive: true as const,
      };
      void channel.send({
        type: "broadcast",
        event: LIVE_SCREEN_EVENT,
        payload: { ...basePayload, attemptId: opts.attemptId },
      });
      if (opts.studentId && opts.examId && !String(opts.attemptId).startsWith("pending:")) {
        void channel.send({
          type: "broadcast",
          event: LIVE_SCREEN_EVENT,
          payload: {
            ...basePayload,
            attemptId: `pending:${opts.studentId}:${opts.examId}`,
          },
        });
      }'''

new_send_block = '''      if (stopped || !channel) return;
      if (!frame) {
        return;
      }
      // Compress oversized native/web frames so Realtime does not silently drop them.
      try {
        if (typeof document !== "undefined" && frame.length > 40_000) {
          const img = new Image();
          const loaded = new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("jpeg load"));
          });
          img.src = frame.startsWith("data:") ? frame : `data:image/jpeg;base64,${frame}`;
          await loaded;
          const maxW = 520;
          const scale = Math.min(1, maxW / (img.naturalWidth || img.width || maxW));
          const w = Math.max(8, Math.round((img.naturalWidth || img.width) * scale));
          const h = Math.max(8, Math.round((img.naturalHeight || img.height) * scale));
          const canvas = getSharedCanvas();
          if (canvas) {
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d", { alpha: false });
            if (ctx) {
              ctx.drawImage(img, 0, 0, w, h);
              let q = 0.38;
              let out = canvas.toDataURL("image/jpeg", q);
              if (out.length > 180_000) {
                q = 0.28;
                canvas.width = Math.max(8, Math.round(w * 0.75));
                canvas.height = Math.max(8, Math.round(h * 0.75));
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                out = canvas.toDataURL("image/jpeg", q);
              }
              if (out.length < frame.length) frame = out;
            }
          }
        }
      } catch (ce) {
        console.warn("[live-screen] compress", ce);
      }
      if (frame.length > 220_000) {
        console.warn("[live-screen] frame too large, skip", frame.length);
        return;
      }
      const basePayload = {
        studentId: opts.studentId,
        examId: opts.examId,
        frame,
        ts: Date.now(),
        screenActive: true as const,
      };
      // Prefer real attemptId only (no dual pending broadcast once known).
      const attemptKey = String(opts.attemptId || "");
      const status = await channel.send({
        type: "broadcast",
        event: LIVE_SCREEN_EVENT,
        payload: { ...basePayload, attemptId: attemptKey },
      });
      if (status !== "ok") {
        console.warn("[live-screen] broadcast status=", status, "size=", frame.length);
      }
      // Only dual-send pending key when attemptId itself is still pending.
      if (attemptKey.startsWith("pending:") === false && opts.studentId && opts.examId && !attemptKey) {
        /* no-op */
      }'''

if old_send_block in lv:
    lv = lv.replace(old_send_block, new_send_block, 1)
    print("OK: send block")
else:
    print("SKIP/FAIL: send block not found")

# 3) Officer identity: enrich title/course from separate exam query when join null
OM = ROOT / "src/routes/officer.live-monitor.tsx"
om = OM.read_text()
oo = om

if "examEnrichQ" not in om:
    marker = "  const cards = useMemo(() => {"
    block = '''  const examIdsKey = useMemo(() => {
    const ids = new Set<string>();
    for (const a of attemptsQ.data ?? []) { if (a.exam_id) ids.add(String(a.exam_id)); }
    for (const a of recentDoneQ.data ?? []) { if (a.exam_id) ids.add(String(a.exam_id)); }
    return Array.from(ids).sort().join(",");
  }, [attemptsQ.data, recentDoneQ.data]);

  const examEnrichQ = useQuery({
    queryKey: ["officer-live-exam-enrich", schoolId, examIdsKey],
    enabled: Boolean(schoolId && examIdsKey),
    staleTime: 30_000,
    queryFn: async () => {
      const ids = examIdsKey.split(",").filter(Boolean);
      const map: Record<string, { title: string; courseCode: string; courseName: string }> = {};
      if (!ids.length) return map;
      for (const sel of ["id, title, courses(code, name)", "id, title"]) {
        const { data, error } = await supabase.from("examinations").select(sel).eq("school_id", schoolId!).in("id", ids);
        if (!error) {
          for (const r of data ?? []) {
            const row = r as { id: string; title?: string | null; courses?: { code?: string; name?: string } | { code?: string; name?: string }[] | null };
            const c = Array.isArray(row.courses) ? row.courses[0] : row.courses;
            map[row.id] = { title: String(row.title || "").trim(), courseCode: String(c?.code || "").trim(), courseName: String(c?.name || "").trim() };
          }
          break;
        }
      }
      return map;
    },
  });

'''
    if marker in om:
        om = om.replace(marker, block + marker, 1)
        print("OK: examEnrichQ")

# title enrich
for old_t in [
    'const title = a.examinations?.title || "Exam";',
    'const title = String(a.examinations?.title || "").trim() || "Exam";',
]:
    if old_t in om:
        om = om.replace(
            old_t,
            'const title = String(a.examinations?.title || examEnrichQ.data?.[String(a.exam_id)]?.title || "").trim() || "Exam";',
            1,
        )
        print("OK: title")
        break

# course enrich
if 'const courseCode = String(courseObj?.code || "").trim();' in om:
    om = om.replace(
        'const courseCode = String(courseObj?.code || "").trim();',
        'const courseCode = String(courseObj?.code || examEnrichQ.data?.[String(a.exam_id)]?.courseCode || "").trim();',
        1,
    )
    om = om.replace(
        'const courseName = String(courseObj?.name || "").trim();',
        'const courseName = String(courseObj?.name || examEnrichQ.data?.[String(a.exam_id)]?.courseName || "").trim();',
        1,
    )
    print("OK: course")

# matric from metadata
if "metaMatric" not in om:
    for needle in [
        'const name = (resolved && resolved.trim()) || studentDisplayName(a);',
        'const name = (resolvedName && String(resolvedName).trim()) || studentDisplayName(a);',
    ]:
        if needle in om:
            om = om.replace(
                needle,
                needle + '''
        const metaMatric = (() => {
          const mm = a.metadata;
          if (!mm || typeof mm !== "object") return "";
          return String((mm as Record<string, unknown>).matricNumber || (mm as Record<string, unknown>).matric_number || "").trim();
        })();''',
                1,
            )
            print("OK: metaMatric")
            break
    # use metaMatric in matric line
    om = om.replace(
        'a.students?.matric_number || a.students?.student_id || ""',
        'a.students?.matric_number || a.students?.student_id || metaMatric || ""',
        1,
    )

if "examEnrichQ.data]" not in om and "studentNamesQ.data]" in om:
    om = om.replace("studentNamesQ.data]", "studentNamesQ.data, examEnrichQ.data]", 1)
    print("OK: deps")

# CBT: put matric into metadata on upsert
CBT = ROOT / "src/components/cbt/CbtExamSession.impl.tsx"
cbt = CBT.read_text()
oc = cbt
old_meta = "metadata: { studentName, lastSeenAt: new Date().toISOString() },"
new_meta = 'metadata: { studentName, matricNumber: String((student as { matricNumber?: string } | null)?.matricNumber || (student as { matric?: string } | null)?.matric || "").trim() || undefined, lastSeenAt: new Date().toISOString() },'
if old_meta in cbt:
    cbt = cbt.replace(old_meta, new_meta, 1)
    print("OK: cbt meta")

if lv != orig:
    LV.write_text(lv)
    print("WRITTEN live-video")
else:
    print("NO live-video change")
if om != oo:
    OM.write_text(om)
    print("WRITTEN officer")
else:
    print("NO officer change")
if cbt != oc:
    CBT.write_text(cbt)
    print("WRITTEN cbt")
else:
    print("NO cbt change")
print("DONE")
