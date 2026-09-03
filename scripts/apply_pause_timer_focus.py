#!/usr/bin/env python3
"""Surgical fixes: pause/resume integrity, absolute timer, focus layout, per-exam logs.\nDoes NOT redesign UI. Does NOT change DB schema."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CBT = ROOT / "src/components/cbt/CbtExamSession.impl.tsx"
OM = ROOT / "src/routes/officer.live-monitor.tsx"

cbt = CBT.read_text()
orig = cbt

if "endsAtRef" not in cbt:
    cbt = cbt.replace(
        "  const pauseUntilRef = useRef<number | null>(null);",
        "  const pauseUntilRef = useRef<number | null>(null);\n"
        "  /** Absolute exam end (ms). Source of truth for remaining time — never frozen by pause. */\n"
        "  const endsAtRef = useRef<number | null>(null);\n"
        "  /** 'officer' = wait for officer; 'integrity' = timed then student resume */\n"
        "  const pauseKindRef = useRef<\"officer\" | \"integrity\" | null>(null);\n"
        "  const [pauseKind, setPauseKind] = useState<\"officer\" | \"integrity\" | null>(null);\n"
        "  const [pauseReadyToResume, setPauseReadyToResume] = useState(false);",
    )
    print("OK: refs")

old_timer_effect = """  useEffect(() => {
    // Timer keeps running during integrity pause — time loss is the consequence
    if (!started || done || seconds == null) return;
    if (seconds <= 0) { void finishAttempt(true); return; }
    const t = window.setInterval(() => setSeconds((s) => (s == null ? s : Math.max(0, s - 1))), 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, done, seconds === 0]);"""

new_timer_effect = """  useEffect(() => {
    // Absolute end-time clock: continues during pause, tab hide, background — never extends.
    if (!started || done || endsAtRef.current == null) return;
    const tick = () => {
      const end = endsAtRef.current;
      if (end == null) return;
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setSeconds(left);
      if (left <= 0 && !finishingRef.current && !doneRef.current) {
        void finishAttempt(true);
      }
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, done]);"""

if old_timer_effect in cbt:
    cbt = cbt.replace(old_timer_effect, new_timer_effect, 1)
    print("OK: absolute timer")
else:
    print("FAIL: timer effect")

old_set_sec = "      setSeconds((examQ.data?.duration_minutes ?? 60) * 60);\n      setStarted(true);"
new_set_sec = """      {
        const durSec = Math.max(60, Number(examQ.data?.duration_minutes ?? 60) * 60);
        let endMs = Date.now() + durSec * 1000;
        const schedEnd = examQ.data?.scheduled_end ? new Date(examQ.data.scheduled_end).getTime() : NaN;
        if (!Number.isNaN(schedEnd) && schedEnd > Date.now()) {
          endMs = Math.min(endMs, schedEnd);
        }
        endsAtRef.current = endMs;
        setSeconds(Math.max(0, Math.ceil((endMs - Date.now()) / 1000)));
      }
      setStarted(true);"""
if old_set_sec in cbt:
    cbt = cbt.replace(old_set_sec, new_set_sec, 1)
    print("OK: endsAt on start")
else:
    print("FAIL: setSeconds start")

old_pause_tick = """  useEffect(() => {
    if (!paused || pauseUntilRef.current == null) return;
    const tick = () => {
      const until = pauseUntilRef.current;
      if (until == null) return;
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setPauseRemainingSec(left);
      if (left <= 0) clearTimedPause();
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [paused, clearTimedPause]);"""

new_pause_tick = """  useEffect(() => {
    // Integrity timed pause: count down, then wait for student to press Resume (never auto-resume).
    if (!paused || pauseUntilRef.current == null) return;
    if (pauseKindRef.current === \"officer\") return;
    const tick = () => {
      const until = pauseUntilRef.current;
      if (until == null) return;
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setPauseRemainingSec(left);
      if (left <= 0) {
        setPauseReadyToResume(true);
        pauseUntilRef.current = null;
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [paused]);"""

if old_pause_tick in cbt:
    cbt = cbt.replace(old_pause_tick, new_pause_tick, 1)
    print("OK: no auto-resume")
else:
    print("FAIL: pause tick")

old_begin = """  const beginTimedPause = useCallback((reason: string) => {
    const secs = Math.max(5, Number(security.pauseDurationSeconds) || 300);
    pauseUntilRef.current = Date.now() + secs * 1000;
    setPauseRemainingSec(secs);
    setPauseReason(reason);
    setPaused(true);
  }, [security.pauseDurationSeconds]);"""

new_begin = """  const beginTimedPause = useCallback((reason: string) => {
    const secs = Math.max(5, Number(security.pauseDurationSeconds) || 300);
    pauseUntilRef.current = Date.now() + secs * 1000;
    setPauseRemainingSec(secs);
    setPauseReason(reason);
    pauseKindRef.current = \"integrity\";
    setPauseKind(\"integrity\");
    setPauseReadyToResume(false);
    setPaused(true);
  }, [security.pauseDurationSeconds]);"""

if old_begin in cbt:
    cbt = cbt.replace(old_begin, new_begin, 1)
    print("OK: beginTimedPause")

old_clear = """  const clearTimedPause = useCallback(() => {
    pauseUntilRef.current = null;
    setPauseRemainingSec(null);
    setPaused(false);
    setPauseReason(\"\");
    void reconnectCamera();
  }, [reconnectCamera]);"""

new_clear = """  const clearTimedPause = useCallback(() => {
    if (pauseKindRef.current === \"officer\") return;
    if (pauseKindRef.current === \"integrity\" && !pauseReadyToResume && pauseUntilRef.current != null) {
      return;
    }
    pauseUntilRef.current = null;
    setPauseRemainingSec(null);
    pauseKindRef.current = null;
    setPauseKind(null);
    setPauseReadyToResume(false);
    setPaused(false);
    setPauseReason(\"\");
    void reconnectCamera();
  }, [reconnectCamera, pauseReadyToResume]);"""

if old_clear in cbt:
    cbt = cbt.replace(old_clear, new_clear, 1)
    print("OK: clearTimedPause guard")

# Remaining patches applied via file from artifacts - marker
print("PART1 DONE")
CBT.write_text(cbt) if cbt != orig else None
