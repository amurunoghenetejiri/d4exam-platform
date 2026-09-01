#!/usr/bin/env python3
"""Surgical officer live-monitor fixes: names + pause/release. Idempotent."""
from pathlib import Path

p = Path(__file__).resolve().parents[1] / "src/routes/officer.live-monitor.tsx"
t = p.read_text()
orig = t

# 1) Put richest select FIRST (remove bare minimal-first that skips joins)
old_selects = (
    "      const selects = [\n"
    "        `id, exam_id, student_id, status, started_at, updated_at, tab_switch_count, metadata`,\n"
    "        `id, exam_id, student_id, status, started_at, updated_at, tab_switch_count, metadata,\n"
    "           examinations(title, status, courses(code, name)),\n"
    "           students(full_name, matric_number, student_id, profiles(full_name))`,"
)
new_selects = (
    "      const selects = [\n"
    "        `id, exam_id, student_id, status, started_at, updated_at, tab_switch_count, metadata,\n"
    "           examinations(title, status, courses(code, name)),\n"
    "           students(full_name, matric_number, student_id, profiles(full_name))`,"
)
if old_selects in t:
    t = t.replace(old_selects, new_selects, 1)
    print("fixed attempts selects order")
else:
    print("selects order already ok or pattern drift")

# 2) Stronger studentNamesQ
old_names = (
    '      const { data: studs } = await supabase\n'
    '        .from("students")\n'
    '        .select("id, full_name, matric_number, profiles(full_name)")\n'
    '        .eq("school_id", schoolId!)\n'
    '        .in("id", ids);\n'
    '      for (const s of studs ?? []) {\n'
    '        const row = s as {\n'
    '          id: string;\n'
    '          full_name?: string | null;\n'
    '          matric_number?: string | null;\n'
    '          profiles?: { full_name?: string | null } | { full_name?: string | null }[] | null;\n'
    '        };\n'
    '        const matric = String(row.matric_number || "").trim();\n'
    '        let name = String(row.full_name || "").trim();\n'
    '        const prof = row.profiles;\n'
    '        const pName = Array.isArray(prof)\n'
    '          ? String(prof[0]?.full_name || "").trim()\n'
    '          : String((prof as { full_name?: string | null } | null)?.full_name || "").trim();\n'
    '        if (!name || name.toLowerCase() === matric.toLowerCase()) name = pName || name;\n'
    '        if (name && name.toLowerCase() !== matric.toLowerCase()) map[row.id] = name;\n'
    '      }\n'
    '      return map;'
)
new_names = (
    '      const nameSelects = [\n'
    '        "id, full_name, matric_number, student_id, profile_id, profiles(full_name, first_name, last_name)",\n'
    '        "id, full_name, matric_number, student_id, profile_id, profiles(full_name)",\n'
    '        "id, full_name, matric_number, student_id, profile_id",\n'
    '        "id, matric_number, student_id, profile_id, profiles(full_name)",\n'
    '        "id, matric_number, student_id, profile_id",\n'
    '      ];\n'
    '      let studs: unknown[] = [];\n'
    '      for (const sel of nameSelects) {\n'
    '        const { data, error } = await supabase.from("students").select(sel).eq("school_id", schoolId!).in("id", ids);\n'
    '        if (!error) { studs = data ?? []; break; }\n'
    '      }\n'
    '      const profileIds: string[] = [];\n'
    '      for (const s of studs) {\n'
    '        const row = s as { id: string; full_name?: string | null; matric_number?: string | null; student_id?: string | null; profile_id?: string | null; profiles?: unknown };\n'
    '        const matric = String(row.matric_number || row.student_id || "").trim();\n'
    '        let name = String(row.full_name || "").trim();\n'
    '        const prof = row.profiles as { full_name?: string | null; first_name?: string | null; last_name?: string | null } | { full_name?: string | null }[] | null;\n'
    '        let pName = "";\n'
    '        if (Array.isArray(prof)) {\n'
    '          const pr = prof[0] as { full_name?: string | null; first_name?: string | null; last_name?: string | null } | undefined;\n'
    '          pName = String(pr?.full_name || [pr?.first_name, pr?.last_name].filter(Boolean).join(" ") || "").trim();\n'
    '        } else if (prof && typeof prof === "object") {\n'
    '          const pr = prof as { full_name?: string | null; first_name?: string | null; last_name?: string | null };\n'
    '          pName = String(pr.full_name || [pr.first_name, pr.last_name].filter(Boolean).join(" ") || "").trim();\n'
    '        }\n'
    '        if (!name || name.toLowerCase() === matric.toLowerCase()) name = pName || name;\n'
    '        if (name && name.toLowerCase() !== matric.toLowerCase()) map[row.id] = name;\n'
    '        if (row.profile_id) profileIds.push(String(row.profile_id));\n'
    '      }\n'
    '      const missing = ids.filter((id) => !map[id]);\n'
    '      if (missing.length && profileIds.length) {\n'
    '        const { data: profs } = await supabase.from("profiles").select("id, full_name, first_name, last_name").in("id", profileIds);\n'
    '        const byPid: Record<string, string> = {};\n'
    '        for (const pr of profs ?? []) {\n'
    '          const r = pr as { id: string; full_name?: string | null; first_name?: string | null; last_name?: string | null };\n'
    '          const n = String(r.full_name || [r.first_name, r.last_name].filter(Boolean).join(" ") || "").trim();\n'
    '          if (n) byPid[r.id] = n;\n'
    '        }\n'
    '        for (const s of studs) {\n'
    '          const row = s as { id: string; profile_id?: string | null };\n'
    '          if (!map[row.id] && row.profile_id && byPid[String(row.profile_id)]) {\n'
    '            map[row.id] = byPid[String(row.profile_id)];\n'
    '          }\n'
    '        }\n'
    '      }\n'
    '      return map;'
)
if old_names in t:
    t = t.replace(old_names, new_names, 1)
    print("fixed studentNamesQ")
else:
    print("studentNamesQ pattern drift or already patched")

# 3) Expand command types
if 'cmd: "submit" | "hold" | "terminate"' in t:
    t = t.replace(
        'cmd: "submit" | "hold" | "terminate"',
        'cmd: "submit" | "hold" | "pause" | "release" | "terminate"',
    )
    print("expanded command types")

# 4) officerControl pause/release
old_hold = (
    '      if (cmd === "hold") {\n'
    '        const meta = { ...(selected.a.metadata || {}), officer_hold: true, officer_hold_at: nowIso };\n'
    '        const { error } = await supabase.from("exam_attempts").update({ metadata: meta, updated_at: nowIso } as never).eq("id", attemptId).eq("school_id", schoolId);\n'
    '        if (error) throw error;\n'
    '        await logSecurityEvent({ schoolId, examId, attemptId, studentId, eventType: "OFFICER_HOLD", severity: "medium", description: "Examination held by officer", extra: { source: "officer_live_monitor", officer_user_id: user?.userId ?? null } });\n'
    '        await broadcastOfficerCommand("hold", attemptId, studentId, examId);\n'
    '        toast.success(`Hold sent to ${selected.name}`);\n'
    '      } else if (cmd === "terminate") {'
)
new_hold = (
    '      if (cmd === "hold" || cmd === "pause") {\n'
    '        const meta = { ...(selected.a.metadata || {}), officer_hold: true, officer_pause: true, officer_hold_at: nowIso };\n'
    '        const { error } = await supabase.from("exam_attempts").update({ metadata: meta, status: "paused", updated_at: nowIso } as never).eq("id", attemptId).eq("school_id", schoolId);\n'
    '        if (error) throw error;\n'
    '        await logSecurityEvent({ schoolId, examId, attemptId, studentId, eventType: "OFFICER_PAUSE", severity: "medium", description: "Examination paused by officer", extra: { source: "officer_live_monitor", officer_user_id: user?.userId ?? null } });\n'
    '        await broadcastOfficerCommand("pause", attemptId, studentId, examId);\n'
    '        toast.success(`Pause sent to ${selected.name}`);\n'
    '      } else if (cmd === "release") {\n'
    '        const prev = { ...(selected.a.metadata || {}) } as Record<string, unknown>;\n'
    '        delete prev.officer_hold; delete prev.officer_pause; delete prev.officer_hold_at;\n'
    '        const { error } = await supabase.from("exam_attempts").update({ metadata: prev, status: "in_progress", updated_at: nowIso } as never).eq("id", attemptId).eq("school_id", schoolId);\n'
    '        if (error) throw error;\n'
    '        await logSecurityEvent({ schoolId, examId, attemptId, studentId, eventType: "OFFICER_RELEASE", severity: "low", description: "Examination released by officer", extra: { source: "officer_live_monitor", officer_user_id: user?.userId ?? null } });\n'
    '        await broadcastOfficerCommand("release", attemptId, studentId, examId);\n'
    '        toast.success(`Release sent to ${selected.name}`);\n'
    '      } else if (cmd === "terminate") {'
)
if old_hold in t:
    t = t.replace(old_hold, new_hold, 1)
    print("fixed pause/release control logic")
else:
    print("hold block pattern drift")

# 5) UI buttons
old_btns = (
    '                <Button size="sm" variant="outline" className="h-8 text-xs font-semibold" disabled={actionBusy || warningBusy} onClick={() => void officerControl("hold")}>\n'
    '                  Hold Exam\n'
    '                </Button>\n'
    '                <Button size="sm" variant="outline" className="h-8 border-red-300 bg-red-50 text-xs font-semibold text-red-700 hover:bg-red-100" disabled={actionBusy || warningBusy} onClick={() => void officerControl("terminate")}>\n'
    '                  Terminate Exam\n'
    '                </Button>'
)
new_btns = (
    '                <Button size="sm" variant="outline" className="h-8 text-xs font-semibold" disabled={actionBusy || warningBusy} onClick={() => void officerControl("pause")}>\n'
    '                  Pause Exam\n'
    '                </Button>\n'
    '                <Button size="sm" variant="outline" className="h-8 text-xs font-semibold" disabled={actionBusy || warningBusy} onClick={() => void officerControl("release")}>\n'
    '                  Release Exam\n'
    '                </Button>\n'
    '                <Button size="sm" variant="outline" className="h-8 border-red-300 bg-red-50 text-xs font-semibold text-red-700 hover:bg-red-100" disabled={actionBusy || warningBusy} onClick={() => void officerControl("terminate")}>\n'
    '                  Terminate Exam\n'
    '                </Button>'
)
if old_btns in t:
    t = t.replace(old_btns, new_btns, 1)
    print("fixed UI buttons")
else:
    print("buttons pattern drift")

if t != orig:
    p.write_text(t)
    print("WROTE", p, "delta", len(t) - len(orig))
else:
    print("NO CHANGE")
