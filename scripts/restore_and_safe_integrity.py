#!/usr/bin/env python3
"""Restore CBT + officer live-monitor from known-good SHA, then apply only safe integrity fixes.
No layout/className dual-ternary changes (those risked blank/slow UI)."""
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
GOOD = "0a46d7bc275a23d4144cdad870160fa15f3c74eb"
BASE = f"https://raw.githubusercontent.com/amurunoghenetejiri/d4exam-platform/{GOOD}"

files = {
    "src/components/cbt/CbtExamSession.impl.tsx": f"{BASE}/src/components/cbt/CbtExamSession.impl.tsx",
    "src/routes/officer.live-monitor.tsx": f"{BASE}/src/routes/officer.live-monitor.tsx",
}

for rel, url in files.items():
    dest = ROOT / rel
    print("download", rel)
    data = urllib.request.urlopen(url, timeout=60).read()
    dest.write_bytes(data)
    print("  bytes", len(data))

cbt = (ROOT / "src/components/cbt/CbtExamSession.impl.tsx").read_text()
om = (ROOT / "src/routes/officer.live-monitor.tsx").read_text()

# no auto-resume
cbt = cbt.replace(
    "      if (left <= 0) clearTimedPause();",
    "      if (left <= 0) { setPauseRemainingSec(0); pauseUntilRef.current = null; }",
)

if "endsAtMsRef" not in cbt:
    cbt = cbt.replace(
        "  const pauseUntilRef = useRef<number | null>(null);",
        "  const pauseUntilRef = useRef<number | null>(null);\n  const endsAtMsRef = useRef<number | null>(null);\n  const officerPauseRef = useRef(false);",
    )

old_timer = """    const t = window.setInterval(() => setSeconds((s) => (s == null ? s : Math.max(0, s - 1))), 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, done, seconds === 0]);"""
new_timer = """    const t = window.setInterval(() => {
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
  }, [started, done]);"""
if old_timer in cbt:
    cbt = cbt.replace(old_timer, new_timer, 1)

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

old_cmd = """      if (cmd === "hold" || cmd === "pause") {
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
new_cmd = """      if (cmd === "hold" || cmd === "pause") {
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
if old_cmd in cbt:
    cbt = cbt.replace(old_cmd, new_cmd, 1)

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
              <Button className="mt-5 w-full font-semibold" onClick={() => { if (officerPauseRef.current) return; void clearTimedPause(); }}>
                Resume Exam
              </Button>
            )}""",
)

om = om.replace(
    'update({ metadata: meta, status: "paused", updated_at: nowIso }',
    'update({ metadata: meta, updated_at: nowIso }',
)
for bad in [
    '.in("status", ["in_progress", "paused", "held", "active"])',
    '.in("status", ["in_progress", "held", "active"])',
]:
    if bad in om:
        om = om.replace(bad, '.in("status", ["in_progress"])')

om = om.replace(
    '{["paused", "held"].includes(String(selected.a.status || "").toLowerCase()) ? (',
    '{(["paused", "held"].includes(String(selected.a.status || "").toLowerCase()) || Boolean((selected.a.metadata as Record<string, unknown> | null)?.officer_pause) || Boolean((selected.a.metadata as Record<string, unknown> | null)?.officer_hold)) ? (',
)
om = om.replace(
    """                  <Button size="sm" variant="outline" className="h-8 text-xs font-semibold" disabled={actionBusy || warningBusy} onClick={() => void officerControl("release")}>
                    Release Exam
                  </Button>""",
    """                  <Button size="sm" variant="outline" className="h-8 text-xs font-semibold" disabled={actionBusy || warningBusy} onClick={() => void officerControl("release")}>
                    Resume Exam
                  </Button>""",
)
om = om.replace(
    ".filter((e) => e.student_id === selected.a.student_id && (!e.exam_id || e.exam_id === selected.a.exam_id))",
    ".filter((e) => e.student_id === selected.a.student_id && e.exam_id && String(e.exam_id) === String(selected.a.exam_id))",
)

(ROOT / "src/components/cbt/CbtExamSession.impl.tsx").write_text(cbt)
(ROOT / "src/routes/officer.live-monitor.tsx").write_text(om)
print("DONE restore+safe integrity")
print("cbt braces", cbt.count('{') - cbt.count('}'))
print("om braces", om.count('{') - om.count('}'))
