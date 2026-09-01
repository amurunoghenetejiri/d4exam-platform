#!/usr/bin/env python3
"""Surgical CBT session fixes: pause/release commands + studentName metadata."""
from pathlib import Path

p = Path(__file__).resolve().parents[1] / "src/components/cbt/CbtExamSession.impl.tsx"
t = p.read_text()
orig = t

old_cmd = (
    '      if (cmd === "hold") {\n'
    '        beginTimedPause("Held by examination officer");\n'
    '        setWarnBanner("Your examination has been held by the officer");\n'
    '        window.setTimeout(() => setWarnBanner(null), 8000);\n'
    '      } else if (cmd === "terminate") {\n'
    '        setDoneTerminated(true);\n'
    '        void finishAttempt(true);\n'
    '      } else if (cmd === "submit") {\n'
    '        void finishAttempt(false);\n'
    '      }'
)
new_cmd = (
    '      if (cmd === "hold" || cmd === "pause") {\n'
    '        // Officer pause: indefinite until release (not timed integrity pause)\n'
    '        pauseUntilRef.current = null;\n'
    '        setPauseRemainingSec(null);\n'
    '        setPauseReason("Paused by examination officer");\n'
    '        setPaused(true);\n'
    '        setWarnBanner("Your examination has been paused by the officer");\n'
    '        window.setTimeout(() => setWarnBanner(null), 10000);\n'
    '      } else if (cmd === "release" || cmd === "resume") {\n'
    '        pauseUntilRef.current = null;\n'
    '        setPauseRemainingSec(null);\n'
    '        setPaused(false);\n'
    '        setPauseReason("");\n'
    '        setWarnBanner("Your examination has been released by the officer");\n'
    '        window.setTimeout(() => setWarnBanner(null), 6000);\n'
    '        void reconnectCamera();\n'
    '      } else if (cmd === "terminate") {\n'
    '        setDoneTerminated(true);\n'
    '        void finishAttempt(true);\n'
    '      } else if (cmd === "submit") {\n'
    '        void finishAttempt(false);\n'
    '      }'
)
if old_cmd in t:
    t = t.replace(old_cmd, new_cmd, 1)
    print("fixed officer command handler")
else:
    print("cmd handler pattern drift")

old_upsert = (
    '          const { data } = await supabase.from("exam_attempts").upsert({\n'
    '            exam_id: id, student_id: student.studentId, school_id: examQ.data?.school_id,\n'
    '            status: "in_progress", started_at: new Date().toISOString(), answers: {},\n'
    '            question_order: orderIds,\n'
    '          } as never, { onConflict: "exam_id,student_id" }).select("id").maybeSingle();'
)
new_upsert = (
    '          const studentName = String((student as { fullName?: string } | null)?.fullName || session?.fullName || "").trim() || undefined;\n'
    '          const { data } = await supabase.from("exam_attempts").upsert({\n'
    '            exam_id: id, student_id: student.studentId, school_id: examQ.data?.school_id,\n'
    '            status: "in_progress", started_at: new Date().toISOString(), answers: {},\n'
    '            question_order: orderIds,\n'
    '            metadata: { studentName, lastSeenAt: new Date().toISOString() },\n'
    '          } as never, { onConflict: "exam_id,student_id" }).select("id").maybeSingle();'
)
if old_upsert in t:
    t = t.replace(old_upsert, new_upsert, 1)
    print("fixed upsert studentName")
else:
    print("upsert pattern drift")

old_upd = (
    '          void supabase.from("exam_attempts").update({\n'
    '            question_order: orderIds,\n'
    '            status: "in_progress",\n'
    '          } as never).eq("id", attemptIdRef.current);'
)
new_upd = (
    '          const studentNameUpd = String((student as { fullName?: string } | null)?.fullName || session?.fullName || "").trim() || undefined;\n'
    '          void supabase.from("exam_attempts").update({\n'
    '            question_order: orderIds,\n'
    '            status: "in_progress",\n'
    '            metadata: { studentName: studentNameUpd, lastSeenAt: new Date().toISOString() },\n'
    '          } as never).eq("id", attemptIdRef.current);'
)
if old_upd in t:
    t = t.replace(old_upd, new_upd, 1)
    print("fixed update studentName")
else:
    print("update pattern drift")

if t != orig:
    p.write_text(t)
    print("WROTE", p, "delta", len(t) - len(orig))
else:
    print("NO CHANGE")
