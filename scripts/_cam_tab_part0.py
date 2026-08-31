#!/usr/bin/env python3
"""Surgical CBT: camera recovery, timed pause, tab counter, live-cam resilience."""
from pathlib import Path

def patch_impl():
    p = Path("src/components/cbt/CbtExamSession.impl.tsx")
    t = p.read_text()
    if "reconnectCamera" in t and "beginTimedPause" in t and "Tab violations" in t:
        print("impl already patched"); return

    old_sel = '"exam_id, fullscreen, tab_monitoring, max_tab_switches, block_copy_paste, randomize_questions, randomize_options, require_camera, require_microphone, face_detection, max_face_warnings, require_screen_share, screen_share_mode, threshold_action, face_violation_action, total_marks, instructions, result_visibility, questions_to_answer"'
    new_sel = old_sel.replace("threshold_action, face_violation_action,", "threshold_action, face_violation_action, pause_duration_seconds,")
    if "pause_duration_seconds" not in t.split("cbt-settings", 1)[-1][:900]:
        if old_sel not in t: raise SystemExit("settings select missing")
        t = t.replace(old_sel, new_sel, 1)

    needle = """  const [warnBanner, setWarnBanner] = useState<string | null>(null);
  const attemptIdRef = useRef<string | null>(null);
  const tabSwitchCountRef = useRef(0);
  const fullscreenExitCountRef = useRef(0);
  const lastViolationAtRef = useRef(0);
  const orderedIdsRef = useRef<string[] | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const [liveAttemptId, setLiveAttemptId] = useState<string | null>(null);
  const finishingRef = useRef(false);
  const startedRef = useRef(false);
  const doneRef = useRef(false);
  const resultIdRef = useRef<string | null>(null);
  startedRef.current = started;
  doneRef.current = done;
  resultIdRef.current = resultId;"""

    repl = """  const [warnBanner, setWarnBanner] = useState<string | null>(null);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [pauseRemainingSec, setPauseRemainingSec] = useState<number | null>(null);
  const attemptIdRef = useRef<string | null>(null);
  const tabSwitchCountRef = useRef(0);
  const fullscreenExitCountRef = useRef(0);
  const lastViolationAtRef = useRef(0);
  const lastTabHiddenAtRef = useRef(0);
  const orderedIdsRef = useRef<string[] | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const cameraReconnectLockRef = useRef(false);
  const pauseUntilRef = useRef<number | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const [liveAttemptId, setLiveAttemptId] = useState<string | null>(null);
  const finishingRef = useRef(false);
  const startedRef = useRef(false);
  const doneRef = useRef(false);
  const pausedRef = useRef(false);
  const resultIdRef = useRef<string | null>(null);
  startedRef.current = started;
  doneRef.current = done;
  pausedRef.current = paused;
  resultIdRef.current = resultId;"""
    if needle not in t: raise SystemExit("state block missing")
    t = t.replace(needle, repl, 1)

    t = t.replace(
        "if (!started || done || seconds == null) return;",
        "if (!started || done || seconds == null || paused) return;",
        1,
    )
    t = t.replace(
        "}, [started, done, seconds === 0]);",
        "}, [started, done, paused, seconds === 0]);",
        1,
    )
