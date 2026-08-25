#!/usr/bin/env python3
from pathlib import Path

def main():
    p = Path("src/components/cbt/ExamCameraPip.tsx")
    c = p.read_text()
    if "pendingRef" not in c:
        old = '  const lastStateRef = useRef<FaceState>("unavailable");'
        new = '  const lastStateRef = useRef<FaceState>("unavailable");\n  const pendingRef = useRef<{ state: FaceState; since: number } | null>(null);\n  const STABILITY_MS = 200;'
        if old in c:
            c = c.replace(old, new, 1)
        old_apply = """    const applyState = (next: FaceState, faceCount: number | null) => {
      const prev = lastStateRef.current;
      setFaceStatus(next);
      lastStateRef.current = next;

      if (next === \"ok\") {
        faceWarnRef.current = Math.max(0, faceWarnRef.current - 1);
        if (prev !== \"ok\") {
          onSecRef.current?.({ kind: \"ok\", faceCount, at: new Date().toISOString() });
        }
        return;
      }

      faceWarnRef.current += 1;
      if (next === \"none\") fireAlert(\"none\", faceCount);
      else if (next === \"multi\") fireAlert(\"multi\", faceCount);
      else if (next === \"unclear\") fireAlert(\"unclear\", faceCount);
      else if (next === \"unavailable\") {
        fireAlert(\"unclear\", faceCount);
      }
    };"""
        new_apply = """    const applyState = (next: FaceState, faceCount: number | null) => {
      const prev = lastStateRef.current;
      const now = Date.now();
      if (next === \"ok\") {
        pendingRef.current = null;
        if (prev !== \"ok\") {
          setFaceStatus(\"ok\");
          lastStateRef.current = \"ok\";
          faceWarnRef.current = Math.max(0, faceWarnRef.current - 1);
          onSecRef.current?.({ kind: \"ok\", faceCount, at: new Date().toISOString() });
        }
        return;
      }
      const pend = pendingRef.current;
      if (!pend || pend.state !== next) {
        pendingRef.current = { state: next, since: now };
        return;
      }
      if (now - pend.since < STABILITY_MS) return;
      pendingRef.current = null;
      if (prev === next) return;
      setFaceStatus(next);
      lastStateRef.current = next;
      faceWarnRef.current += 1;
      if (next === \"none\") fireAlert(\"none\", faceCount);
      else if (next === \"multi\") fireAlert(\"multi\", faceCount);
      else if (next === \"unclear\") fireAlert(\"unclear\", faceCount);
      else if (next === \"unavailable\") fireAlert(\"unclear\", faceCount);
    };"""
        if old_apply in c:
            c = c.replace(old_apply, new_apply, 1)
            print("pip hysteresis ok")
        else:
            print("pip applyState missing")
    for a, b in [
        ('? "Multiple faces"', '? "Multiple faces detected"'),
        ('? "Face not seen"', '? "No face detected"'),
        ('? "Monitoring · 1 face"', '? "1 face monitoring"'),
        ('? "Face unclear"', '? "Detecting face"'),
    ]:
        c = c.replace(a, b)
    p.write_text(c)
    print("pip", p.stat().st_size)

    fd = Path("src/lib/face-detector.ts")
    fdt = fd.read_text()
    fdt = fdt.replace("const NMS_IOU = 0.35;", "const NMS_IOU = 0.40;")
    fdt = fdt.replace("const STRONG_SCORE = 0.4;", "const STRONG_SCORE = 0.45;")
    fd.write_text(fdt)
    print("face-detector ok")

    es = Path("src/lib/exam-security.ts")
    et = es.read_text()
    if "pauseDurationSeconds: 300" not in et:
        et = et.replace(
            '  thresholdAction: "flag",\n  resultVisibility:',
            '  thresholdAction: "flag",\n  pauseDurationSeconds: 300,\n  resultVisibility:',
        )
    if "pause_duration_seconds" not in et:
        et = et.replace(
            "    threshold_action: n.thresholdAction,",
            "    threshold_action: n.thresholdAction,\n    pause_duration_seconds: n.pauseDurationSeconds ?? 300,",
        )
        et = et.replace(
            "  threshold_action?: string | null;\n  result_visibility?: string | null;",
            "  threshold_action?: string | null;\n  pause_duration_seconds?: number | null;\n  result_visibility?: string | null;",
        )
        et = et.replace(
            '    if (row.threshold_action != null) {\n      fromRow.thresholdAction = row.threshold_action as ExamSecuritySettings["thresholdAction"];\n    }',
            '    if (row.threshold_action != null) {\n      fromRow.thresholdAction = row.threshold_action as ExamSecuritySettings["thresholdAction"];\n    }\n    if (row.pause_duration_seconds != null) {\n      fromRow.pauseDurationSeconds = Number(row.pause_duration_seconds) || 300;\n    }',
        )
    es.write_text(et)
    print("exam-security ok")

    tr = Path("src/routes/teacher.exam-security.tsx")
    tt = tr.read_text()
    if 'SelectItem value="pause"' not in tt:
        old_sel = """                <SelectContent>
                  <SelectItem value=\"warn\">Warn candidate</SelectItem>
                  <SelectItem value=\"flag\">Flag for review</SelectItem>
                  <SelectItem value=\"terminate\">Terminate attempt</SelectItem>
                </SelectContent>"""
        new_sel = """                <SelectContent>
                  <SelectItem value=\"warn\">Warning Only</SelectItem>
                  <SelectItem value=\"flag\">Flag for Review</SelectItem>
                  <SelectItem value=\"pause\">Pause Exam</SelectItem>
                  <SelectItem value=\"auto_submit\">Auto-Submit Exam</SelectItem>
                  <SelectItem value=\"terminate\">Terminate Exam</SelectItem>
                </SelectContent>"""
        tt = tt.replace(old_sel, new_sel)
    tt = tt.replace(
        '<Label className="font-semibold">When threshold is reached</Label>',
        '<Label className="font-semibold">TAB VIOLATION consequence</Label>',
    )
    tt = tt.replace(
        '<Label className="font-semibold">Max tab switches before action</Label>',
        '<Label className="font-semibold">TAB VIOLATION limit</Label>',
    )
    if "pauseDurationSeconds" not in tt:
        marker = '              </Select>\n            </div>\n            <Toggle\n              label="Block copy / paste"'
        pause_block = """              </Select>
            </div>
            {settings.thresholdAction === \"pause\" && (
              <div className=\"space-y-2 rounded-xl border border-slate-200 px-4 py-3\">
                <Label className=\"font-semibold\">Pause duration (seconds)</Label>
                <Input
                  type=\"number\"
                  min={30}
                  max={3600}
                  step={30}
                  value={settings.pauseDurationSeconds ?? 300}
                  onChange={(e) => toggle(\"pauseDurationSeconds\", Math.max(30, Number(e.target.value) || 300))}
                />
                <p className=\"text-xs text-slate-500\">Examples: 30, 60, 300 (5 min), 600 (10 min)</p>
              </div>
            )}
            <Toggle
              label=\"Block copy / paste\""""
        if marker in tt:
            tt = tt.replace(marker, pause_block)
    tr.write_text(tt)
    print("teacher ok")

    g = Path("src/components/cbt/ExamSecurityGate.tsx")
    gt = g.read_text()
    if "tabConsequenceLabel" not in gt:
        needle = '  const secRows: { label: string; enabled: boolean; detail?: string }[] = ['
        inject = '''  const tabLimit = Math.max(1, Number(security.maxTabSwitches) || 5);
  const tabAction = security.thresholdAction || "flag";
  const pauseSecs = Math.max(30, Number(security.pauseDurationSeconds) || 300);
  const tabConsequenceLabel =
    tabAction === "terminate"
      ? "Exam Termination"
      : tabAction === "pause"
        ? `Pause Exam (${Math.round(pauseSecs / 60) || 1} min)`
        : tabAction === "auto_submit"
          ? "Auto-Submit Exam"
          : tabAction === "warn"
            ? "Warning Only"
            : "Flag for Review";
  const tabConsequenceExplain =
    tabAction === "terminate"
      ? `Leaving the examination screen ${tabLimit} times will terminate your examination.`
      : tabAction === "pause"
        ? `Leaving the examination screen ${tabLimit} times will pause your examination for ${Math.round(pauseSecs / 60) || 1} minute(s).`
        : tabAction === "auto_submit"
          ? `Leaving the examination screen ${tabLimit} times will automatically submit your examination.`
          : tabAction === "warn"
            ? "You will receive a warning when the configured violation limit is reached."
            : `Leaving the examination screen ${tabLimit} times will flag your examination for review.`;

  const secRows: { label: string; enabled: boolean; detail?: string }[] = ['''
        if needle in gt:
            gt = gt.replace(needle, inject, 1)
        old_tab = '''    {
      label: "Tab monitoring",
      enabled: Boolean(security.tabMonitoring),
      detail: security.tabMonitoring ? `max ${security.maxTabSwitches}` : undefined,
    },'''
        new_tab = '''    {
      label: "Tab monitoring",
      enabled: Boolean(security.tabMonitoring),
      detail: security.tabMonitoring ? `max ${tabLimit}` : undefined,
    },
    {
      label: "Tab violation consequence",
      enabled: Boolean(security.tabMonitoring),
      detail: security.tabMonitoring ? tabConsequenceLabel : undefined,
    },'''
        if old_tab in gt:
            gt = gt.replace(old_tab, new_tab, 1)
        gt = gt.replace(
            "{security.tabMonitoring && <li>• Leaving this tab is counted and recorded.</li>}",
            """{security.tabMonitoring && (
              <>
                <li>• Maximum tab violations: <strong>{tabLimit}</strong></li>
                <li>• Consequence: <strong>{tabConsequenceLabel}</strong></li>
                <li>• {tabConsequenceExplain}</li>
              </>
            )}""",
        )
        gt = gt.replace(
            "I have read and accept the monitoring notice and the examination rules.",
            "I have read and understood the examination instructions and security rules.",
        )
        g.write_text(gt)
        print("gate ok")
    else:
        print("gate already ok")

    s = Path("src/components/cbt/CbtExamSession.impl.tsx")
    st = s.read_text()
    if "pause_duration_seconds" not in st:
        st = st.replace(
            "threshold_action, face_violation_action",
            "threshold_action, pause_duration_seconds, face_violation_action",
        )
    if "TAB_VIOLATION" not in st:
        old = """      const max = security.maxTabSwitches ?? 5;
      if (tabSwitchCountRef.current >= max) {
        void applyConsequence(\"TAB_SWITCH\", `Left the exam window (switch ${tabSwitchCountRef.current}/${max}).`);
      } else {
        void logSecurityEvent({
          schoolId, examId: id, attemptId: attemptIdRef.current, studentId,
          eventType: \"TAB_SWITCH\", severity: \"low\",
          description: `Left the exam window (switch ${tabSwitchCountRef.current}/${max}).`,
          questionIndex: index,
        });
        setWarnBanner(`Stay on the exam screen. Switches: ${tabSwitchCountRef.current}/${max}`);
        window.setTimeout(() => setWarnBanner(null), 4000);
      }"""
        new = """      const max = Math.max(1, Number(security.maxTabSwitches) || 5);
      const count = tabSwitchCountRef.current;
      void logSecurityEvent({
        schoolId, examId: id, attemptId: attemptIdRef.current, studentId,
        eventType: \"TAB_VIOLATION\", severity: count >= max ? \"high\" : \"low\",
        description: `Tab violation ${count}/${max}.`,
        questionIndex: index,
        extra: { tab_switch_count: count, max_tab_switches: max, threshold_action: security.thresholdAction },
      });
      setWarnBanner(`Tab Violation: ${count}/${max}`);
      window.setTimeout(() => setWarnBanner(null), 4500);
      if (count < max) return;
      const action = security.thresholdAction || \"flag\";
      if (action === \"warn\") {
        setWarnBanner(\"EXAMINATION WARNING — You exceeded the configured tab-violation threshold.\");
        void logSecurityEvent({
          schoolId, examId: id, attemptId: attemptIdRef.current, studentId,
          eventType: \"TAB_WARNING\", severity: \"medium\",
          description: \"Tab violation threshold reached (warning only).\",
          questionIndex: index,
        });
        return;
      }
      if (action === \"flag\") {
        setWarnBanner(\"Your examination has been flagged for review because of repeated tab violations.\");
        if (attemptIdRef.current) {
          void supabase.from(\"exam_attempts\").update({ status: \"flagged\" } as never).eq(\"id\", attemptIdRef.current);
        }
        void logSecurityEvent({
          schoolId, examId: id, attemptId: attemptIdRef.current, studentId,
          eventType: \"TAB_FLAGGED\", severity: \"high\",
          description: \"Tab violation threshold — flagged for review.\",
          questionIndex: index,
        });
        return;
      }
      if (action === \"pause\") {
        const secs = Math.max(30, Number((security as { pauseDurationSeconds?: number }).pauseDurationSeconds) || 300);
        const ends = new Date(Date.now() + secs * 1000).toISOString();
        try { sessionStorage.setItem(`d4-pause-end-${id}`, ends); } catch { /* */ }
        if (attemptIdRef.current) {
          void supabase.from(\"exam_attempts\").update({ status: \"paused\" } as never).eq(\"id\", attemptIdRef.current);
        }
        void logSecurityEvent({
          schoolId, examId: id, attemptId: attemptIdRef.current, studentId,
          eventType: \"TAB_PAUSE\", severity: \"high\",
          description: `Tab violation threshold — paused ${secs}s.`,
          questionIndex: index,
          extra: { pause_ends_at: ends, pause_seconds: secs },
        });
        setPauseReason(`You exceeded the permitted number of tab violations (${count}/${max}).`);
        setPaused(true);
        return;
      }
      if (action === \"auto_submit\") {
        void logSecurityEvent({
          schoolId, examId: id, attemptId: attemptIdRef.current, studentId,
          eventType: \"TAB_AUTO_SUBMIT\", severity: \"high\",
          description: \"Tab violation threshold — auto-submitted.\",
          questionIndex: index,
        });
        setDoneTerminated(true);
        void finishAttempt(true);
        return;
      }
      void logSecurityEvent({
        schoolId, examId: id, attemptId: attemptIdRef.current, studentId,
        eventType: \"TAB_TERMINATION\", severity: \"high\",
        description: \"Tab violation threshold — terminated.\",
        questionIndex: index,
      });
      setDoneTerminated(true);
      void finishAttempt(true);"""
        if old in st:
            st = st.replace(old, new, 1)
            print("session tab ok")
        else:
            print("session tab pattern missing")
    if "PauseContinueButton" not in st:
        old_p = '            <Button className="mt-5 w-full font-semibold" onClick={() => void restoreFullscreenFromUser()}>Resume examination</Button>'
        new_p = '            <PauseContinueButton examId={id} onContinue={() => { setPaused(false); setPauseReason(""); void restoreFullscreenFromUser(); }} />'
        if old_p in st:
            st = st.replace(old_p, new_p, 1)
            st = st.replace(">EXAM PAUSED<", ">EXAMINATION PAUSED<")
            helper = '''
function PauseContinueButton({ examId, onContinue }: { examId: string; onContinue: () => void }) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const tick = () => {
      try {
        const raw = sessionStorage.getItem(`d4-pause-end-${examId}`);
        if (!raw) { setLeft(0); return; }
        setLeft(Math.max(0, Math.ceil((new Date(raw).getTime() - Date.now()) / 1000)));
      } catch { setLeft(0); }
    };
    tick();
    const t = window.setInterval(tick, 250);
    return () => window.clearInterval(t);
  }, [examId]);
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  return (
    <>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Examination will resume in</p>
      <p className="mt-1 font-mono text-3xl font-extrabold tabular-nums text-primary">{mm}:{ss}</p>
      <Button className="mt-5 w-full font-semibold" disabled={left > 0} onClick={onContinue}>Continue Exam</Button>
    </>
  );
}

'''
            st = st.replace("export { CbtExamPage as CbtExamSession };", helper + "export { CbtExamPage as CbtExamSession };")
            print("pause ui ok")
    s.write_text(st)

    css = Path("src/styles.css")
    ct = css.read_text()
    if "cbt-exam-toast" not in ct:
        ct += """

[data-sonner-toast].cbt-exam-toast {
  font-size: 0.75rem !important;
  padding: 0.5rem 0.75rem !important;
}
html.d4-exam-immersive [data-sonner-toaster] {
  top: auto !important;
  bottom: 1rem !important;
  left: 50% !important;
  right: auto !important;
  transform: translateX(-50%) !important;
  z-index: 120 !important;
}
"""
        css.write_text(ct)
        print("css ok")

    Path("DEPLOY_TRIGGER.txt").write_text("cbt-integrity-complete\n")
    print("ALL DONE")

if __name__ == "__main__":
    main()
