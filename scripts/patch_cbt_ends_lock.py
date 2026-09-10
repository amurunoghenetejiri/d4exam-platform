#!/usr/bin/env python3
"""Patch CbtExamSession.impl.tsx: ends_at resume, locked answers, autosave."""
from pathlib import Path
import sys

p = Path("src/components/cbt/CbtExamSession.impl.tsx")
t = p.read_text()
if len(t) < 40000 or "PLACEHOLDER" in t:
    print("REFUSE bad cbt size", len(t))
    sys.exit(1)

changed = []

old = '.select("id, status, question_order, tab_switch_count, fullscreen_exit_count, answers")'
new = '.select("id, status, question_order, tab_switch_count, fullscreen_exit_count, answers, ends_at, started_at")'
if old in t:
    t = t.replace(old, new)
    changed.append("select")

if "Restore absolute end clock" not in t:
    m = "// Build paper now so we can lock order"
    ins = """
        // Restore absolute end clock from attempt (do not reset timer on Continue)
        try {
          const ea = (existingFull as { ends_at?: string | null }).ends_at;
          if (ea) {
            const ends = new Date(String(ea)).getTime();
            if (!Number.isNaN(ends) && ends > Date.now()) {
              endsAtRef.current = ends;
              setSeconds(Math.max(0, Math.ceil((ends - Date.now()) / 1000)));
            }
          }
        } catch { /* ignore */ }
"""
    if m in t:
        t = t.replace(m, ins + m, 1)
        changed.append("ends_restore")

needle = """      {
        const durationSec = Math.max(60, Number(examQ.data?.duration_minutes ?? 60) * 60);
        const now = Date.now();
        let ends = now + durationSec * 1000;
        const schedEnd = examQ.data?.scheduled_end ? new Date(String(examQ.data.scheduled_end)).getTime() : NaN;
        if (!Number.isNaN(schedEnd) && schedEnd > now) {
          ends = Math.min(ends, schedEnd);
        }
        endsAtRef.current = ends;
        setSeconds(Math.max(0, Math.ceil((ends - now) / 1000)));
      }
      setStarted(true);
      setIndex(0);"""

repl = """      {
        const durationSec = Math.max(60, Number(examQ.data?.duration_minutes ?? 60) * 60);
        const now = Date.now();
        if (endsAtRef.current != null && endsAtRef.current > now) {
          setSeconds(Math.max(0, Math.ceil((endsAtRef.current - now) / 1000)));
        } else {
          let ends = now + durationSec * 1000;
          const schedEnd = examQ.data?.scheduled_end ? new Date(String(examQ.data.scheduled_end)).getTime() : NaN;
          if (!Number.isNaN(schedEnd) && schedEnd > now) {
            ends = Math.min(ends, schedEnd);
          }
          endsAtRef.current = ends;
          setSeconds(Math.max(0, Math.ceil((ends - now) / 1000)));
          if (attemptIdRef.current) {
            void supabase.from("exam_attempts").update({
              ends_at: new Date(ends).toISOString(),
              status: "in_progress",
            } as never).eq("id", attemptIdRef.current);
          }
        }
      }
      setStarted(true);
      if (!(orderedIdsRef.current && orderedIdsRef.current.length)) {
        setIndex(0);
      }"""

if needle in t:
    t = t.replace(needle, repl)
    changed.append("timer")

if "const locked = q ? answers[q.id] != null" not in t:
    t = t.replace(
        "const selected = q ? answers[q.id] === oi : false;",
        "const selected = q ? answers[q.id] === oi : false;\n              const locked = q ? answers[q.id] != null : false;",
        1,
    )
    old_btn = (
        '<button type="button" onClick={() => {\n'
        "                    if (q) setAnswers((a) => ({ ...a, [q.id]: oi }));\n"
        "                  }"
    )
    new_btn = (
        '<button type="button" disabled={locked && !selected}\n'
        "                    onClick={() => {\n"
        "                      if (!q || answers[q.id] != null) return;\n"
        "                      setAnswers((a) => ({ ...a, [q.id]: oi }));\n"
        "                    }"
    )
    if old_btn in t:
        t = t.replace(old_btn, new_btn, 1)
        changed.append("lock")

if "Persist answers + ends_at" not in t:
    ac = t.find("const answeredCount = Object.keys(answers).length;")
    if ac > 0:
        le = t.find("\n", ac)
        auto = """

  // Persist answers + ends_at while in progress (resume safety)
  useEffect(() => {
    if (!started || done || previewMode || !attemptIdRef.current) return;
    if (!Object.keys(answers).length) return;
    const aid = attemptIdRef.current;
    const tId = window.setTimeout(() => {
      void supabase.from("exam_attempts").update({
        answers,
        ends_at: endsAtRef.current ? new Date(endsAtRef.current).toISOString() : undefined,
        status: "in_progress",
        updated_at: new Date().toISOString(),
      } as never).eq("id", aid);
    }, 1200);
    return () => window.clearTimeout(tId);
  }, [answers, started, done, previewMode]);
"""
        t = t[: le + 1] + auto + t[le + 1 :]
        changed.append("autosave")

if not changed:
    print("already applied")
else:
    print("applied:", ",".join(changed))

if len(t) < 40000 or "PLACEHOLDER" in t:
    print("REFUSE after patch", len(t))
    sys.exit(1)

p.write_text(t)
print("OK final", len(t))
Path("FORCE_DEPLOY.txt").write_text("cbt-ends-lock-final 2026-09-10\n")
