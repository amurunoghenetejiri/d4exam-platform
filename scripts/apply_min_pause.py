#!/usr/bin/env python3
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
CBT = ROOT / "src/components/cbt/CbtExamSession.impl.tsx"
OM = ROOT / "src/routes/officer.live-monitor.tsx"
cbt = CBT.read_text()
om = OM.read_text()

om2 = om.replace(
  'update({ metadata: meta, status: "paused", updated_at: nowIso }',
  'update({ metadata: meta, updated_at: nowIso }',
)
if om2 != om:
    om = om2
    print("OK pause status")

om = om.replace(
  '.in("status", ["in_progress", "paused", "held", "active"])',
  '.in("status", ["in_progress", "held", "active"])',
)

cbt = cbt.replace(
  "      if (left <= 0) clearTimedPause();",
  "      if (left <= 0) { setPauseRemainingSec(0); /* wait for student Resume — do not auto-resume */ }",
)

old = """    const t = window.setInterval(() => setSeconds((s) => (s == null ? s : Math.max(0, s - 1))), 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, done, seconds === 0]);"""
if "endsAtMsRef" not in cbt:
    cbt = cbt.replace(
        "  const pauseUntilRef = useRef<number | null>(null);",
        "  const pauseUntilRef = useRef<number | null>(null);\n  const endsAtMsRef = useRef<number | null>(null);\n  const officerPauseRef = useRef(false);",
    )
    print("OK endsAtMsRef")

if old in cbt:
    cbt = cbt.replace(old, """    const t = window.setInterval(() => {
      if (endsAtMsRef.current != null) {
        const left = Math.max(0, Math.ceil((endsAtMsRef.current - Date.now()) / 1000));
        setSeconds(left);
        if (left <= 0 && !finishingRef.current && !doneRef.current) void finishAttempt(true);
      } else {
        setSeconds((s) => (s == null ? s : Math.max(0, s - 1)));
      }
    }, 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, done]);""", 1)
    print("OK timer")

cbt = cbt.replace(
    "      setSeconds((examQ.data?.duration_minutes ?? 60) * 60);\n      setStarted(true);",
    """      {
        const dur = Math.max(60, Number(examQ.data?.duration_minutes ?? 60) * 60);
        endsAtMsRef.current = Date.now() + dur * 1000;
        setSeconds(dur);
      }
      setStarted(true);""",
    1,
)

old_op = """      if (cmd === "hold" || cmd === "pause") {
        // Officer pause: indefinite until release (not timed integrity pause)
        pauseUntilRef.current = null;
        setPauseRemainingSec(null);
        setPauseReason("Paused by examination officer");
        setPaused(true);
        setWarnBanner("Your examination has been paused by the officer");
        window.setTimeout(() => setWarnBanner(null), 10000);
      } else if (cmd === "release" || cmd === "resume") {
        pauseUntilRef.current = null;
        setPauseRemainingSec(null);
        setPaused(false);
        setPauseReason("");
        setWarnBanner("Your examination has been released by the officer");
        window.setTimeout(() => setWarnBanner(null), 6000);
        void reconnectCamera();
      }"""
new_op = """      if (cmd === "hold" || cmd === "pause") {
        pauseUntilRef.current = null;
        setPauseRemainingSec(null);
        officerPauseRef.current = true;
        setPauseReason("This examination has been paused by the examination officer.");
        setPaused(true);
        setWarnBanner("Your examination has been paused by the officer");
        window.setTimeout(() => setWarnBanner(null), 10000);
      } else if (cmd === "release" || cmd === "resume") {
        pauseUntilRef.current = null;
        setPauseRemainingSec(null);
        officerPauseRef.current = false;
        setPaused(false);
        setPauseReason("");
        setWarnBanner("Your examination has been released by the officer");
        window.setTimeout(() => setWarnBanner(null), 6000);
        void reconnectCamera();
      }"""
if old_op in cbt:
    cbt = cbt.replace(old_op, new_op, 1)
    print("OK officer cmds")

cbt = cbt.replace(
    "Resumes automatically when the timer reaches zero",
    "Please wait until the pause period is completed",
)
cbt = cbt.replace(
    """            ) : (
              <Button className="mt-5 w-full font-semibold" onClick={() => void clearTimedPause()}>
                Resume examination
              </Button>
            )}""",
    """            ) : officerPauseRef.current ? (
              <p className="mt-4 text-xs font-semibold text-slate-500">Waiting for the examination officer to resume your examination.</p>
            ) : (
              <Button className="mt-5 w-full font-semibold" onClick={() => void clearTimedPause()}>
                Resume Exam
              </Button>
            )}""",
)

om = om.replace(
    ".filter((e) => e.student_id === selected.a.student_id && (!e.exam_id || e.exam_id === selected.a.exam_id))",
    ".filter((e) => e.student_id === selected.a.student_id && e.exam_id && String(e.exam_id) === String(selected.a.exam_id))",
)

om = om.replace(
    '"relative aspect-[4/3] max-h-[28vh] overflow-hidden rounded-xl bg-slate-900 shadow-inner ring-1 ring-black/10 sm:max-h-[32vh]"',
    'dual ? "relative aspect-[4/3] max-h-[28vh] overflow-hidden rounded-xl bg-slate-900 shadow-inner ring-1 ring-black/10 sm:max-h-[32vh]" : "relative aspect-video max-h-[48vh] overflow-hidden rounded-xl bg-slate-900 shadow-inner ring-1 ring-black/10"',
)
om = om.replace(
    '"relative aspect-[4/3] max-h-[28vh] overflow-hidden rounded-xl bg-slate-950 shadow-inner ring-1 ring-black/10 sm:max-h-[32vh]"',
    'dual ? "relative aspect-[4/3] max-h-[28vh] overflow-auto rounded-xl bg-slate-950 shadow-inner ring-1 ring-black/10 sm:max-h-[32vh]" : "relative max-h-[56vh] min-h-[28vh] overflow-auto rounded-xl bg-slate-950 shadow-inner ring-1 ring-black/10"',
)
om = om.replace(
    'className="h-full w-full object-contain bg-black"',
    'className="mx-auto block h-auto w-full object-contain bg-black"',
)

om = om.replace(
    '{["paused", "held"].includes(String(selected.a.status || "").toLowerCase()) ? (',
    '{(["paused", "held"].includes(String(selected.a.status || "").toLowerCase()) || Boolean((selected.a.metadata as any)?.officer_pause) || Boolean((selected.a.metadata as any)?.officer_hold)) ? (',
)
om = om.replace(
    """                  <Button size="sm" variant="outline" className="h-8 text-xs font-semibold" disabled={actionBusy || warningBusy} onClick={() => void officerControl("release")}>
                    Release Exam
                  </Button>""",
    """                  <Button size="sm" variant="outline" className="h-8 text-xs font-semibold" disabled={actionBusy || warningBusy} onClick={() => void officerControl("release")}>
                    Resume Exam
                  </Button>""",
)

CBT.write_text(cbt)
OM.write_text(om)

om = OM.read_text()
om = om.replace(
    '<div className=dual ? "relative aspect-[4/3] max-h-[28vh] overflow-auto rounded-xl bg-slate-950 shadow-inner ring-1 ring-black/10 sm:max-h-[32vh]" : "relative max-h-[56vh] min-h-[28vh] overflow-auto rounded-xl bg-slate-950 shadow-inner ring-1 ring-black/10">',
    '<div className={dual ? "relative aspect-[4/3] max-h-[28vh] overflow-auto rounded-xl bg-slate-950 shadow-inner ring-1 ring-black/10 sm:max-h-[32vh]" : "relative max-h-[56vh] min-h-[28vh] overflow-auto rounded-xl bg-slate-950 shadow-inner ring-1 ring-black/10"}>',
)
om = om.replace(
    '<div className=dual ? "relative aspect-[4/3] max-h-[28vh] overflow-hidden rounded-xl bg-slate-900 shadow-inner ring-1 ring-black/10 sm:max-h-[32vh]" : "relative aspect-video max-h-[48vh] overflow-hidden rounded-xl bg-slate-900 shadow-inner ring-1 ring-black/10">',
    '<div className={dual ? "relative aspect-[4/3] max-h-[28vh] overflow-hidden rounded-xl bg-slate-900 shadow-inner ring-1 ring-black/10 sm:max-h-[32vh]" : "relative aspect-video max-h-[48vh] overflow-hidden rounded-xl bg-slate-900 shadow-inner ring-1 ring-black/10"}>',
)
OM.write_text(om)
print("DONE")
