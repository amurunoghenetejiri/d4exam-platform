#!/usr/bin/env python3
"""Fix: lock answered questions after leave+return; live tab-violation consequences."""
from pathlib import Path

def main():
    p = Path("src/components/cbt/CbtExamSession.impl.tsx")
    t = p.read_text()
    assert len(t) > 40000, f"too small {len(t)}"

    if "leftExamSessionRef" not in t:
        t = t.replace(
            "const [lockedAnswerIds, setLockedAnswerIds] = useState<Set<string>>(() => new Set());",
            "const [lockedAnswerIds, setLockedAnswerIds] = useState<Set<string>>(() => new Set());\n"
            "  /** True after student left exam (tab/app) — on return, lock already-answered questions. */\n"
            "  const leftExamSessionRef = useRef(false);",
        )
        print("leftExamSessionRef")

    if "flushAttemptProgress" not in t:
        insert_after = "  const answersRef = useRef<Record<string, number>>({});\n  answersRef.current = answers;"
        helper = insert_after + """
  const flushAttemptProgress = useCallback(async () => {
    const aid = attemptIdRef.current;
    if (!aid) return;
    try {
      await supabase.from("exam_attempts").update({
        answers: answersRef.current,
        ends_at: endsAtRef.current ? new Date(endsAtRef.current).toISOString() : undefined,
        tab_switch_count: tabSwitchCountRef.current,
        status: "in_progress",
        updated_at: new Date().toISOString(),
      } as never).eq("id", aid);
    } catch (e) {
      console.warn("[cbt] flushAttemptProgress", e);
    }
  }, []);"""
        if insert_after in t:
            t = t.replace(insert_after, helper)
            print("flushAttemptProgress")
        else:
            print("WARN: answersRef block missing")

    start_marker = "  // Integrity: fullscreen exit + app background / tab switch\n  useEffect(() => {"
    if start_marker not in t:
        print("FATAL: integrity effect not found")
        p.write_text(t)
        return
    start = t.find(start_marker)
    end_marker = "    // finishAttempt is stable enough via refs for this monitoring effect"
    end = t.find(end_marker, start)
    if end < 0:
        end_marker2 = 'document.removeEventListener("visibilitychange", onVis);'
        end = t.find(end_marker2, start)
        if end > 0:
            end = t.find("}, [", end)
            end = t.find("]);", end) + 3
    else:
        end = t.find("]);", end) + 3

    if end <= start:
        print("FATAL: could not find end of integrity effect")
        p.write_text(t)
        return

    new_effect = r'''  // Integrity: fullscreen exit + app background / tab switch
  useEffect(() => {
    if (!started || done || previewMode) return;
    const schoolId = String(examQ.data?.school_id ?? student?.schoolId ?? session?.schoolId ?? "");
    const studentId = student?.studentId;
    if (!schoolId || !studentId || !id) return;

    const DEBOUNCE_MS = 1200;

    const applyConsequence = async (eventType: string, description: string) => {
      const now = Date.now();
      if (now - lastViolationAtRef.current < DEBOUNCE_MS) return;
      lastViolationAtRef.current = now;

      const action = String(security.thresholdAction || "flag").toLowerCase();
      void logSecurityEvent({
        schoolId, examId: id, attemptId: attemptIdRef.current, studentId,
        eventType, severity: action === "terminate" ? "high" : "medium",
        description, questionIndex: index,
        extra: {
          tab_switch_count: tabSwitchCountRef.current,
          fullscreen_exit_count: fullscreenExitCountRef.current,
          threshold_action: action,
        },
      });

      try { haptic("tab_switch"); } catch { /* ignore */ }

      if (action === "warn" || action === "flag") {
        setWarnBanner(description);
        window.setTimeout(() => setWarnBanner(null), 6000);
      } else if (action === "pause") {
        beginTimedPause(description);
      } else if (action === "terminate" || action === "auto_submit" || action === "submit") {
        setDoneTerminated(action === "terminate");
        await finishAttempt(true);
      }
    };

    const recordTabLeave = () => {
      if (finishingRef.current || doneRef.current) return;
      if (!security.tabMonitoring) {
        leftExamSessionRef.current = true;
        void flushAttemptProgress();
        return;
      }
      if (pausedRef.current) {
        leftExamSessionRef.current = true;
        void flushAttemptProgress();
        return;
      }
      const now = Date.now();
      if (now - lastTabHiddenAtRef.current < 600) return;
      lastTabHiddenAtRef.current = now;
      leftExamSessionRef.current = true;
      tabSwitchCountRef.current += 1;
      setTabSwitchCount(tabSwitchCountRef.current);
      void flushAttemptProgress();
      if (attemptIdRef.current) {
        void (async () => {
          try {
            const aid = attemptIdRef.current!;
            const { data: prevRow } = await supabase.from("exam_attempts").select("metadata").eq("id", aid).maybeSingle();
            const prevMeta = prevRow?.metadata && typeof prevRow.metadata === "object" && !Array.isArray(prevRow.metadata)
              ? (prevRow.metadata as Record<string, unknown>)
              : {};
            await supabase.from("exam_attempts").update({
              tab_switch_count: tabSwitchCountRef.current,
              answers: answersRef.current,
              ends_at: endsAtRef.current ? new Date(endsAtRef.current).toISOString() : undefined,
              metadata: {
                ...prevMeta,
                tabSwitchCount: tabSwitchCountRef.current,
                lastSeenAt: new Date().toISOString(),
                lastTabLeaveAt: new Date().toISOString(),
              },
              updated_at: new Date().toISOString(),
            } as never).eq("id", aid);
          } catch (e) {
            console.warn("[cbt] tab_switch persist", e);
          }
        })();
      }
      const max = Math.max(1, Number(security.maxTabSwitches) || 5);
      if (tabSwitchCountRef.current >= max) {
        void applyConsequence(
          "TAB_SWITCH",
          `Left the exam window (switch ${tabSwitchCountRef.current}/${max}). Threshold reached.`,
        );
      } else {
        void logSecurityEvent({
          schoolId, examId: id, attemptId: attemptIdRef.current, studentId,
          eventType: "TAB_SWITCH", severity: "low",
          description: `Left the exam window (switch ${tabSwitchCountRef.current}/${max}).`,
          questionIndex: index,
        });
        setWarnBanner(`Stay on the exam screen. Switches: ${tabSwitchCountRef.current}/${max}`);
        try { haptic("tab_switch"); } catch { /* ignore */ }
        window.setTimeout(() => setWarnBanner(null), 4000);
      }
    };

    const onReturnToExam = () => {
      if (leftExamSessionRef.current) {
        const ids = new Set(
          Object.keys(answersRef.current).filter(
            (k) => answersRef.current[k] !== undefined && answersRef.current[k] !== null,
          ),
        );
        if (ids.size) {
          setLockedAnswerIds((prev) => {
            const next = new Set(prev);
            ids.forEach((id) => next.add(id));
            return next;
          });
        }
        leftExamSessionRef.current = false;
      }
      void flushAttemptProgress();
      void reconnectCamera();
    };

    const onFsChange = () => {
      if (finishingRef.current || doneRef.current) return;
      if (!security.fullscreen) return;
      if (document.fullscreenElement) {
        setFsGate(false);
        return;
      }
      fullscreenExitCountRef.current += 1;
      setFsGate(true);
      void applyConsequence("FULLSCREEN_EXIT", "Fullscreen was exited during the examination.");
      if (attemptIdRef.current) {
        void supabase.from("exam_attempts").update({
          fullscreen_exit_count: fullscreenExitCountRef.current,
        } as never).eq("id", attemptIdRef.current);
      }
    };

    const onVis = () => {
      if (document.visibilityState === "hidden") {
        recordTabLeave();
      } else if (document.visibilityState === "visible") {
        onReturnToExam();
      }
    };

    const onPageHide = () => {
      recordTabLeave();
    };

    const onWindowBlur = () => {
      if (document.visibilityState === "hidden") return;
      recordTabLeave();
    };

    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("blur", onWindowBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, done, previewMode, student?.studentId, id, liveAttemptId, security.tabMonitoring, security.maxTabSwitches, security.thresholdAction, security.fullscreen, flushAttemptProgress]);
'''

    t = t[:start] + new_effect + t[end:]
    print("integrity effect replaced", start, end)

    if "setLockedAnswerIds(lockedIds)" not in t:
        old = "            const prev = existingFull.answers as Record<string, number>;\n            setAnswers(prev);"
        new = "            const prev = existingFull.answers as Record<string, number>;\n            setAnswers(prev);\n            const lockedIds = new Set(Object.keys(prev).filter((k) => prev[k] !== undefined && prev[k] !== null));\n            setLockedAnswerIds(lockedIds);"
        if old in t:
            t = t.replace(old, new)
            print("resume lock added")

    if "lockedAnswerIds.has(q.id)" not in t:
        t = t.replace("const locked = q ? answers[q.id] != null : false", "const locked = q ? lockedAnswerIds.has(q.id) : false")
        t = t.replace("if (!q || answers[q.id] != null) return;", "if (!q || lockedAnswerIds.has(q.id)) return;")
        print("option lock wiring")

    needle = 'selected ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-slate-200 hover:border-primary/40"'
    repl = 'locked ? "border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed line-through" : selected ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-slate-200 hover:border-primary/40"'
    if needle in t and "opacity-50 cursor-not-allowed" not in t:
        t = t.replace(needle, repl)
        print("grey styles")

    p.write_text(t)
    print("Cbt written", len(t))
    print("DONE")

if __name__ == "__main__":
    main()
