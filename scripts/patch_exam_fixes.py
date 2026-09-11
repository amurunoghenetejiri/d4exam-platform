#!/usr/bin/env python3
"""Idempotent patches for terminate, lock-on-resume, absolute timer, force-submit messages."""
from pathlib import Path

def main():
    p = Path("src/components/cbt/CbtExamSession.impl.tsx")
    t = p.read_text()
    assert len(t) > 40000, f"Cbt too small: {len(t)}"

    if "doneForceSubmit" not in t:
        t = t.replace(
            "const [doneTerminated, setDoneTerminated] = useState(false);",
            "const [doneTerminated, setDoneTerminated] = useState(false);\n  const [doneForceSubmit, setDoneForceSubmit] = useState(false);",
        )
        print("doneForceSubmit")

    if "answersRef" not in t:
        t = t.replace(
            'const [answers, setAnswers] = useState<Record<string, number>>({});',
            'const [answers, setAnswers] = useState<Record<string, number>>({});\n  const answersRef = useRef<Record<string, number>>({});\n  answersRef.current = answers;',
        )
        print("answersRef")

    if "lockedAnswerIds" not in t:
        t = t.replace(
            "const resumeIndexRef = useRef<number | null>(null);",
            "const resumeIndexRef = useRef<number | null>(null);\n  /** Lock answers only after leave+continue (not while continuously writing). */\n  const [lockedAnswerIds, setLockedAnswerIds] = useState<Set[string]>(() => new Set());".replace("Set[string]", "Set<string>"),
        )
        print("lockedAnswerIds state")

    if "setLockedAnswerIds(lockedIds)" not in t:
        old = "            const prev = existingFull.answers as Record<string, number>;\n            setAnswers(prev);"
        new = "            const prev = existingFull.answers as Record<string, number>;\n            setAnswers(prev);\n            const lockedIds = new Set(Object.keys(prev).filter((k) => prev[k] !== undefined && prev[k] !== null));\n            setLockedAnswerIds(lockedIds);"
        if old in t:
            t = t.replace(old, new)
            print("locked on resume")

    t = t.replace("if (!q || answers[q.id] != null) return;", "if (!q || lockedAnswerIds.has(q.id)) return;")
    t = t.replace("const locked = q ? answers[q.id] != null : false", "const locked = q ? lockedAnswerIds.has(q.id) : false")

    needle = 'selected ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-slate-200 hover:border-primary/40"'
    repl = 'locked ? "border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed line-through" : selected ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-slate-200 hover:border-primary/40"'
    if needle in t and "opacity-50 cursor-not-allowed" not in t:
        t = t.replace(needle, repl)
        print("grey styles")

    old_restore = (
        "        // Restore absolute end clock from attempt (do not reset timer on Continue)\n"
        "        try {\n"
        "          const ea = (existingFull as { ends_at?: string | null }).ends_at;\n"
        "          if (ea) {\n"
        "            const ends = new Date(String(ea)).getTime();\n"
        "            if (!Number.isNaN(ends) && ends > Date.now()) {\n"
        "              endsAtRef.current = ends;\n"
        "              setSeconds(Math.max(0, Math.ceil((ends - Date.now()) / 1000)));\n"
        "            }\n"
        "          }\n"
        "        } catch { /* ignore */ }"
    )
    new_restore = (
        "        // Restore absolute end clock from attempt (do not reset timer on Continue)\n"
        "        try {\n"
        "          const ea = (existingFull as { ends_at?: string | null } | null)?.ends_at;\n"
        "          const sa = (existingFull as { started_at?: string | null } | null)?.started_at;\n"
        "          let endsMs: number | null = null;\n"
        "          if (ea) {\n"
        "            const ends = new Date(String(ea)).getTime();\n"
        "            if (!Number.isNaN(ends)) endsMs = ends;\n"
        "          }\n"
        "          if (endsMs == null && sa) {\n"
        "            const startMs = new Date(String(sa)).getTime();\n"
        "            const mins = Math.max(1, Number(examQ.data?.duration_minutes ?? 60));\n"
        "            if (!Number.isNaN(startMs)) endsMs = startMs + mins * 60_000;\n"
        "          }\n"
        "          if (endsMs != null) {\n"
        "            endsAtRef.current = endsMs;\n"
        "            setSeconds(Math.max(0, Math.ceil((endsMs - Date.now()) / 1000)));\n"
        "            if (!ea && attemptIdRef.current) {\n"
        "              void supabase.from(\"exam_attempts\").update({\n"
        "                ends_at: new Date(endsMs).toISOString(),\n"
        "              } as never).eq(\"id\", attemptIdRef.current);\n"
        "            }\n"
        "          }\n"
        "        } catch { /* ignore */ }"
    )
    if old_restore in t:
        t = t.replace(old_restore, new_restore)
        print("timer restore")

    t = t.replace(
        "if (endsAtRef.current != null && endsAtRef.current > now)",
        "if (endsAtRef.current != null)",
    )

    marker = "Absolute end clock"
    if marker in t:
        start = t.find(marker)
        chunk = t[start:start+700]
        if "visibilitychange" not in chunk:
            old_ret = (
                "    const t = window.setInterval(tick, 1000);\n"
                "    return () => window.clearInterval(t);\n"
                "    // eslint-disable-next-line react-hooks/exhaustive-deps\n"
                "  }, [started, done]);"
            )
            new_ret = (
                "    const t = window.setInterval(tick, 1000);\n"
                "    const onVis = () => { if (document.visibilityState === \"visible\") tick(); };\n"
                "    document.addEventListener(\"visibilitychange\", onVis);\n"
                "    window.addEventListener(\"focus\", onVis);\n"
                "    return () => { window.clearInterval(t); document.removeEventListener(\"visibilitychange\", onVis); window.removeEventListener(\"focus\", onVis); };\n"
                "    // eslint-disable-next-line react-hooks/exhaustive-deps\n"
                "  }, [started, done]);"
            )
            if old_ret in t:
                t = t.replace(old_ret, new_ret, 1)
                print("timer visibility")

    t = t.replace(", 1200)", ", 300)")
    t = t.replace(", 400)", ", 300)")
    if "answersRef" in t:
        t = t.replace("        answers,\n        ends_at:", "        answers: answersRef.current,\n        ends_at:")

    # Officer command flags
    if 'setDoneForceSubmit(true)' not in t:
        t = t.replace(
            'setDoneTerminated(true);\n        setPaused(false);\n        try { haptic("officer_submit"); } catch { /* ignore */ }\n        void finishAttempt(true);',
            'setDoneTerminated(true);\n        setDoneForceSubmit(false);\n        setPaused(false);\n        try { haptic("officer_submit"); } catch { /* ignore */ }\n        void finishAttempt(true);',
        )
        t = t.replace(
            'setDoneTerminated(false);\n        setPaused(false);\n        try { haptic("officer_submit"); } catch { /* ignore */ }\n        void finishAttempt(false);',
            'setDoneTerminated(false);\n        setDoneForceSubmit(true);\n        setPaused(false);\n        try { haptic("officer_submit"); } catch { /* ignore */ }\n        void finishAttempt(false);',
        )
        print("officer flags")

    if "meta.officer_force_submit" not in t:
        t = t.replace(
            'setDoneTerminated(false);\n          void finishAttempt(false);',
            'setDoneTerminated(false);\n          if (meta.officer_force_submit) setDoneForceSubmit(true);\n          void finishAttempt(false);',
        )

    t = t.replace("void poll(), 4000)", "void poll(), 1500)")
    t = t.replace("setInterval(() => void poll(), 4000)", "setInterval(() => void poll(), 1500)")

    if "if (doneTerminated)" not in t or "no result recorded" not in t:
        # finishAttempt body - try replace terminated: auto path
        if "terminated: auto, resultVisibility" in t:
            t = t.replace(
                "answers, terminated: auto, resultVisibility: security.resultVisibility,",
                "answers: answersRef.current, terminated: doneTerminated, resultVisibility: security.resultVisibility,",
            )
            print("finishAttempt terminated flag")

    t = t.replace(
        "Your examination has been terminated by the examination officer. This examination can no longer be continued.",
        "Your examination has been terminated by the examination officer for an examination violation. No result was recorded for this attempt.",
    )

    t = t.replace("{resultId && (", "{resultId && !doneTerminated && (")

    p.write_text(t)
    print("Cbt written", len(t))

    # Officer terminate harden
    op = Path("src/routes/officer.live-monitor.tsx")
    if op.exists():
        ot = op.read_text()
        if 'officer_terminated: true' not in ot and 'cmd === "terminate"' in ot:
            ot = ot.replace(
                'description: "Examination terminated by officer"',
                'description: "Examination terminated by officer for examination violation"',
            )
            # Extra broadcasts
            if 'broadcastOfficerCommand("terminate"' in ot and 'setTimeout(() => { void broadcastOfficerCommand("terminate"' not in ot:
                ot = ot.replace(
                    'await broadcastOfficerCommand("terminate", attemptId, studentId, examId);\n        toast.success(`Terminated ${selected.name}`);',
                    'await broadcastOfficerCommand("terminate", attemptId, studentId, examId);\n        window.setTimeout(() => { void broadcastOfficerCommand("terminate", attemptId, studentId, examId); }, 500);\n        window.setTimeout(() => { void broadcastOfficerCommand("terminate", attemptId, studentId, examId); }, 1500);\n        toast.success(`Terminated ${selected.name}`);',
                )
            op.write_text(ot)
            print("officer")

    # saveCbtResult skip result when terminated
    sp = Path("src/lib/cbt-save-result.ts")
    if sp.exists():
        st = sp.read_text()
        needle = "  const scored = scoreObjectiveAnswers(questionsForScore, input.answers);"
        if needle in st and "if (input.terminated)" not in st:
            insert = (
                "  if (input.terminated) {\n"
                "    if (input.attemptId) {\n"
                "      await supabase.from(\"exam_attempts\").update({\n"
                "        status: \"terminated\",\n"
                "        answers: input.answers,\n"
                "        submitted_at: new Date().toISOString(),\n"
                "        updated_at: new Date().toISOString(),\n"
                "      } as never).eq(\"id\", input.attemptId);\n"
                "    }\n"
                "    return {\n"
                "      scored: { totalScore: 0, maxMarks: 0, percentage: 0, grade: \"—\", passFail: \"—\", correct: 0, wrong: 0, unanswered: 0 },\n"
                "      error: null,\n"
                "      resultId: undefined,\n"
                "      status: \"terminated\",\n"
                "      published: false,\n"
                "    };\n"
                "  }\n\n"
                "  const scored = scoreObjectiveAnswers(questionsForScore, input.answers);"
            )
            st = st.replace(needle, insert)
            sp.write_text(st)
            print("saveCbtResult guard")

    print("DONE")

if __name__ == "__main__":
    main()
