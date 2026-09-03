#!/usr/bin/env python3
"""Stability fixes: stop render spam, valid attempt status filter, officer load.
Keep pause/timer/focus integrity behavior."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CBT = ROOT / "src/components/cbt/CbtExamSession.impl.tsx"
OM = ROOT / "src/routes/officer.live-monitor.tsx"

cbt = CBT.read_text()
om = OM.read_text()

old_tick = """  useEffect(() => {
    if (!paused || pauseUntilRef.current == null) return;
    const tick = () => {
      const until = pauseUntilRef.current;
      if (until == null) return;
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setPauseRemainingSec(left);
      if (left <= 0) { setPauseRemainingSec(0); /* wait for student Resume — do not auto-resume */ }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [paused, clearTimedPause]);"""

new_tick = """  useEffect(() => {
    if (!paused || pauseUntilRef.current == null) return;
    let finished = false;
    const tick = () => {
      if (finished) return;
      const until = pauseUntilRef.current;
      if (until == null) return;
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setPauseRemainingSec((prev) => (prev === left ? prev : left));
      if (left <= 0) {
        finished = true;
        pauseUntilRef.current = null;
      }
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [paused]);"""

if old_tick in cbt:
    cbt = cbt.replace(old_tick, new_tick, 1)
    print("OK: pause tick stable")
else:
    if "wait for student Resume" in cbt and "finished = true" not in cbt:
        cbt = cbt.replace(
            "      if (left <= 0) { setPauseRemainingSec(0); /* wait for student Resume — do not auto-resume */ }",
            "      if (left <= 0) { pauseUntilRef.current = null; setPauseRemainingSec(0); }",
        )
        print("OK: pause tick partial")
    else:
        print("FAIL: pause tick")

old_clear = """  const clearTimedPause = useCallback(() => {
    pauseUntilRef.current = null;
    setPauseRemainingSec(null);
    setPaused(false);
    setPauseReason("");
    void reconnectCamera();
  }, [reconnectCamera]);"""

new_clear = """  const clearTimedPause = useCallback(() => {
    if (officerPauseRef.current) return;
    pauseUntilRef.current = null;
    setPauseRemainingSec(null);
    setPaused(false);
    setPauseReason("");
    void reconnectCamera();
  }, [reconnectCamera]);"""

if old_clear in cbt:
    cbt = cbt.replace(old_clear, new_clear, 1)
    print("OK: clearTimedPause guard")
elif "if (officerPauseRef.current) return" not in cbt:
    cbt = cbt.replace(
        "  const clearTimedPause = useCallback(() => {\n    pauseUntilRef.current = null;",
        "  const clearTimedPause = useCallback(() => {\n    if (officerPauseRef.current) return;\n    pauseUntilRef.current = null;",
        1,
    )
    print("OK: clearTimedPause inject")

for bad in [
    '.in("status", ["in_progress", "held", "active"])',
    '.in("status", ["in_progress", "paused", "held", "active"])',
]:
    if bad in om:
        om = om.replace(bad, '.in("status", ["in_progress"])')
        print("OK: status filter")

om = om.replace("refetchInterval: 3_000,", "refetchInterval: 5_000,", 1)

om = om.replace(
    "Boolean((selected.a.metadata as any)?.officer_pause) || Boolean((selected.a.metadata as any)?.officer_hold)",
    "Boolean((selected.a.metadata as Record<string, unknown> | null)?.officer_pause) || Boolean((selected.a.metadata as Record<string, unknown> | null)?.officer_hold)",
)

CBT.write_text(cbt)
OM.write_text(om)
print("DONE")
