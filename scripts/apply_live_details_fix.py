#!/usr/bin/env python3
"""Fix live name/course/exam/stats + dashboard count. No UI redesign."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OM = ROOT / "src/routes/officer.live-monitor.tsx"
CBT = ROOT / "src/components/cbt/CbtExamSession.impl.tsx"
LV = ROOT / "src/lib/live-video.ts"
CAM = ROOT / "src/lib/use-live-cam-publish.ts"
DASH = ROOT / "src/routes/officer.index.tsx"

lv = LV.read_text()
olv = lv
if "tabSwitchCount?: number" not in lv:
    lv = lv.replace(
        "  timeRemainingSec?: number | null;\n};",
        "  timeRemainingSec?: number | null;\n  tabSwitchCount?: number;\n};",
        1,
    )
    lv = lv.replace(
        "    timeRemainingSec?: number | null;\n    studentName?: string;",
        "    timeRemainingSec?: number | null;\n    tabSwitchCount?: number;\n    studentName?: string;",
        1,
    )
    lv = lv.replace(
        "          timeRemainingSec: meta.timeRemainingSec,\n          studentName: meta.studentName,",
        "          timeRemainingSec: meta.timeRemainingSec,\n          tabSwitchCount: meta.tabSwitchCount,\n          studentName: meta.studentName,",
        1,
    )
    print("OK: live-video tab")
if lv != olv:
    LV.write_text(lv)

cam = CAM.read_text()
if "getTabSwitchCount" not in cam:
    cam = cam.replace(
        "  getExamTitle?: () => string | null | undefined;\n}) {",
        "  getExamTitle?: () => string | null | undefined;\n  getTabSwitchCount?: () => number;\n}) {",
        1,
    )
    cam = cam.replace(
        '          examTitle: String(o.getExamTitle?.() || "").trim() || undefined,\n        };',
        '          examTitle: String(o.getExamTitle?.() || "").trim() || undefined,\n'
        "          tabSwitchCount: o.getTabSwitchCount?.(),\n        };",
        1,
    )
    CAM.write_text(cam)
    print("OK: cam")

cbt = CBT.read_text()
ocbt = cbt
if "getTabSwitchCount" not in cbt:
    cbt = cbt.replace(
        '    getExamTitle: () => String(examQ.data?.title || "").trim() || null,\n  });',
        '    getExamTitle: () => String(examQ.data?.title || "").trim() || null,\n'
        "    getTabSwitchCount: () => tabSwitchCountRef.current,\n  });",
        1,
    )
    print("OK: cbt tab")

old_meta = (
    'metadata: { studentName: studentName || session?.fullName || undefined, matricNumber: String((student as { matricNumber?: string } | null)?.matricNumber || (student as { matric?: string } | null)?.matric || session?.identifier || "").trim() || undefined, lastSeenAt: new Date().toISOString() },'
)
new_meta = (
    'metadata: { studentName: studentName || session?.fullName || undefined, '
    'matricNumber: String((student as { matricNumber?: string } | null)?.matricNumber || (student as { matric?: string } | null)?.matric || session?.identifier || "").trim() || undefined, '
    'courseCode: (Array.isArray((examQ.data as { courses?: { code?: string }[] } | null)?.courses) ? String((examQ.data as { courses: { code?: string }[] }).courses[0]?.code || "").trim() : String((examQ.data as { courses?: { code?: string } } | null)?.courses?.code || "").trim()) || undefined, '
    'examTitle: String(examQ.data?.title || "").trim() || undefined, '
    'lastSeenAt: new Date().toISOString() },'
)
if old_meta in cbt:
    cbt = cbt.replace(old_meta, new_meta, 1)
    print("OK: upsert meta")

old_merge = (
    "metadata: { ...prevMeta, studentName: studentNameUpd || prevMeta.studentName, matricNumber: matricUpd || prevMeta.matricNumber, lastSeenAt: new Date().toISOString() },"
)
new_merge = (
    "metadata: { ...prevMeta, studentName: studentNameUpd || prevMeta.studentName, matricNumber: matricUpd || prevMeta.matricNumber, "
    "courseCode: (Array.isArray((examQ.data as { courses?: { code?: string }[] } | null)?.courses) ? String((examQ.data as { courses: { code?: string }[] }).courses[0]?.code || prevMeta.courseCode || \"\").trim() : String((examQ.data as { courses?: { code?: string } } | null)?.courses?.code || prevMeta.courseCode || \"\").trim()) || prevMeta.courseCode, "
    "examTitle: String(examQ.data?.title || prevMeta.examTitle || \"\").trim() || prevMeta.examTitle, "
    "lastSeenAt: new Date().toISOString() },"
)
if old_merge in cbt:
    cbt = cbt.replace(old_merge, new_merge, 1)
    print("OK: merge meta")

if cbt != ocbt:
    CBT.write_text(cbt)
    print("WRITTEN cbt")

om = OM.read_text()
oom = om

if "tabSwitchCount?: number" not in om.split("type FrameEntry")[1][:500]:
    om = om.replace(
        "type FrameEntry = { src: string; ts: number; faceStatus?: string; cameraActive?: boolean; answeredCount?: number; totalQuestions?: number; timeRemainingSec?: number | null; studentName?: string; matricNumber?: string; courseCode?: string; examTitle?: string; studentId?: string; examId?: string };",
        "type FrameEntry = { src: string; ts: number; faceStatus?: string; cameraActive?: boolean; answeredCount?: number; totalQuestions?: number; timeRemainingSec?: number | null; tabSwitchCount?: number; studentName?: string; matricNumber?: string; courseCode?: string; examTitle?: string; studentId?: string; examId?: string };",
    )
    print("OK: FrameEntry")

if "tabSwitchCount: typeof p.tabSwitchCount" not in om and "tabSwitchCount: typeof (p as" not in om:
    om = om.replace(
        "          timeRemainingSec: p.timeRemainingSec,\n          studentName: p.studentName",
        "          timeRemainingSec: p.timeRemainingSec,\n"
        '          tabSwitchCount: typeof (p as { tabSwitchCount?: number }).tabSwitchCount === "number" ? (p as { tabSwitchCount?: number }).tabSwitchCount : undefined,\n'
        "          studentName: p.studentName",
        1,
    )
    print("OK: recv tab")

old_pres = """        if ((hasLiveVideo || (camFrame && isLiveCamFrameUsable(camFrame.ts, now)) || (scrFrame && isLiveScreenFrameUsable(scrFrame.ts, now))) && frame) {
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
        }"""

new_pres = """        const statsFrame = camFrame || frame;
        if ((hasLiveVideo || (camFrame && isLiveCamFrameUsable(camFrame.ts, now)) || (scrFrame && isLiveScreenFrameUsable(scrFrame.ts, now))) && (statsFrame || frame)) {
          const tsSrc = frame || statsFrame;
          if (tsSrc?.ts) presence.lastSeenAt = new Date(tsSrc.ts).toISOString();
          presence.cameraActive = true;
          if (statsFrame?.faceStatus) {
            const fs = String(statsFrame.faceStatus).toLowerCase();
            if (fs === "ok" || fs === "none" || fs === "multi" || fs === "unclear" || fs === "unavailable") {
              presence.faceStatus = fs as typeof presence.faceStatus;
            }
          } else if (!presence.faceStatus || presence.faceStatus === "unknown" || presence.faceStatus === "unavailable") {
            presence.faceStatus = "ok";
          }
          if (typeof statsFrame?.answeredCount === "number") presence.answeredCount = statsFrame.answeredCount;
          if (typeof statsFrame?.totalQuestions === "number") presence.totalQuestions = statsFrame.totalQuestions;
          if (typeof statsFrame?.timeRemainingSec === "number") presence.timeRemainingSec = statsFrame.timeRemainingSec;
          if (typeof statsFrame?.tabSwitchCount === "number") {
            (presence as { tabSwitchCount?: number }).tabSwitchCount = statsFrame.tabSwitchCount;
          }
        } else if (frame?.ts && !presence.lastSeenAt) {
          presence.lastSeenAt = new Date(frame.ts).toISOString();
        }"""

if old_pres in om:
    om = om.replace(old_pres, new_pres, 1)
    print("OK: presence")
else:
    print("FAIL: presence")

old_tab = '              <Info label="Tab switches" value={String(selected.a.tab_switch_count ?? 0)} />'
new_tab = (
    '              <Info label="Tab switches" value={String(Math.max(\n'
    "                Number(selected.a.tab_switch_count ?? 0),\n"
    "                Number((selected.presence as { tabSwitchCount?: number }).tabSwitchCount ?? 0),\n"
    "              ))} />"
)
if old_tab in om:
    om = om.replace(old_tab, new_tab, 1)
    print("OK: tab info")

if "officer-live-name-by-matric" not in om:
    anchor = "  const examIdsKey = useMemo(() => {"
    inject = '''
  const nameByMatricQ = useQuery({
    queryKey: ["officer-live-name-by-matric", schoolId, studentIdsKey],
    enabled: Boolean(schoolId && studentIdsKey),
    staleTime: 30_000,
    queryFn: async () => {
      const map: Record<string, string> = {};
      const { data } = await supabase
        .from("students")
        .select("id, full_name, matric_number, student_id, profiles(full_name, first_name, last_name)")
        .eq("school_id", schoolId!)
        .limit(500);
      for (const s of data ?? []) {
        const row = s as {
          id: string;
          full_name?: string | null;
          matric_number?: string | null;
          student_id?: string | null;
          profiles?: { full_name?: string | null; first_name?: string | null; last_name?: string | null } | { full_name?: string | null }[] | null;
        };
        const matric = String(row.matric_number || row.student_id || "").trim().toLowerCase();
        let name = String(row.full_name || "").trim();
        const prof = row.profiles;
        let pName = "";
        if (Array.isArray(prof)) {
          const pr = prof[0] as { full_name?: string | null; first_name?: string | null; last_name?: string | null } | undefined;
          pName = String(pr?.full_name || [pr?.first_name, pr?.last_name].filter(Boolean).join(" ") || "").trim();
        } else if (prof && typeof prof === "object") {
          const pr = prof as { full_name?: string | null; first_name?: string | null; last_name?: string | null };
          pName = String(pr.full_name || [pr.first_name, pr.last_name].filter(Boolean).join(" ") || "").trim();
        }
        if (!name || name.toLowerCase() === matric) name = pName || name;
        if (name) {
          map[row.id] = name;
          if (matric) map[`matric:${matric}`] = name;
        }
      }
      return map;
    },
  });

  '''
    if anchor in om:
        om = om.replace(anchor, inject + anchor, 1)
        print("OK: nameByMatricQ")

    om = om.replace(
        "const resolved = studentNamesQ.data?.[String(a.student_id)];",
        "const resolved = studentNamesQ.data?.[String(a.student_id)];\n"
        '        const byMatricKey = String(a.students?.matric_number || a.students?.student_id || (a.metadata as Record<string, unknown> | null)?.matricNumber || "").trim().toLowerCase();\n'
        "        const fromMatricMap = byMatricKey ? nameByMatricQ.data?.[`matric:${byMatricKey}`] : undefined;\n"
        "        const fromIdMap = nameByMatricQ.data?.[String(a.student_id)];",
        1,
    )
    om = om.replace(
        "const nameCandidates = [resolvedName, frameName, metaName, fromJoin].filter(",
        "const nameCandidates = [resolvedName, fromIdMap, fromMatricMap, frameName, metaName, fromJoin].filter(",
        1,
    )
    om = om.replace(
        "[attemptsQ.data, recentDoneQ.data, now, frames, screenFrames, feedMode, studentNamesQ.data, examEnrichQ.data];",
        "[attemptsQ.data, recentDoneQ.data, now, frames, screenFrames, feedMode, studentNamesQ.data, nameByMatricQ.data, examEnrichQ.data];",
        1,
    )
    print("OK: name candidates")

old_primary = """  const primaryExamLabel = liveExams[0]
    ? `${(Array.isArray(liveExams[0].courses) ? (liveExams[0].courses[0] as { code?: string } | undefined)?.code : (liveExams[0].courses as { code?: string } | null)?.code) ?? ""} · ${liveExams[0].title}`
    : cards[0]
      ? `${cards[0].course} · ${cards[0].title}`
      : "No live exam";"""
new_primary = """  const primaryExamLabel = (() => {
    if (liveExams[0]) {
      const c = Array.isArray(liveExams[0].courses)
        ? (liveExams[0].courses[0] as { code?: string } | undefined)?.code
        : (liveExams[0].courses as { code?: string } | null)?.code;
      const code = String(c || "").trim();
      const title = String(liveExams[0].title || "").trim();
      if (code && title) return `${code} · ${title}`;
      if (title) return title;
      if (code) return code;
    }
    const c0 = cards.find((c) => c.course && c.course !== "\u2014" && c.title && c.title !== "Exam") || cards[0];
    if (c0) {
      const course = c0.course && c0.course !== "\u2014" ? c0.course : "";
      const title = c0.title && c0.title !== "Exam" ? c0.title : "";
      if (course && title) return `${course} · ${title}`;
      if (title) return title;
      if (course) return course;
    }
    return "No live exam";
  })();""".replace("\\u2014", "\u2014")
if old_primary in om:
    om = om.replace(old_primary, new_primary, 1)
    print("OK: primary label")

if om != oom:
    OM.write_text(om)
    print("WRITTEN officer")
else:
    print("NO officer change")

dash = DASH.read_text()
old_ret = """      const examIds = new Set<string>();
      for (const a of active) {
        const eid = (a as { exam_id: string | null }).exam_id;
        if (eid) examIds.add(eid);
      }
      return { liveExams: examIds.size, writers: active.length };"""
new_ret = """      const examIds = new Set<string>();
      for (const a of active) {
        const eid = (a as { exam_id: string | null }).exam_id;
        if (eid) examIds.add(eid);
      }
      let ongoingCount = 0;
      try {
        const { count } = await supabase
          .from("examinations")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId)
          .eq("status", "ongoing");
        ongoingCount = count ?? 0;
      } catch {
        /* ignore */
      }
      let liveExams = examIds.size;
      if (liveExams === 0 && active.length > 0) liveExams = Math.max(1, ongoingCount);
      else if (ongoingCount > liveExams && active.length > 0) liveExams = Math.max(liveExams, ongoingCount);
      return { liveExams, writers: active.length };"""
if old_ret in dash:
    dash = dash.replace(old_ret, new_ret, 1)
    DASH.write_text(dash)
    print("WRITTEN dash")
else:
    print("FAIL: dash")

print("ALL DONE")
