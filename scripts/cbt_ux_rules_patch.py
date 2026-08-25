#!/usr/bin/env python3
"""Targeted CBT rules/UX patch — no redesign."""
from pathlib import Path

def main():
    # ---------- 1) teacher.examinations.tsx: Face violation → TAB VIOLATION ----------
    p = Path("src/routes/teacher.examinations.tsx")
    t = p.read_text()

    old_block = '''              <div className="space-y-2 rounded-xl border border-slate-200 px-4 py-3">
                <Label className="font-semibold">Maximum face warnings</Label>
                <Input type="number" min={1} max={50} value={security.maxFaceWarnings ?? 5} disabled={!security.faceDetection} onChange={(e) => toggleSec("maxFaceWarnings", Number(e.target.value) || 5)} />
              </div>
              <div className="space-y-2 rounded-xl border border-slate-200 px-4 py-3">
                <Label className="font-semibold">Action after repeated face violations</Label>
                <Select value={security.faceViolationAction || "flag"} onValueChange={(v) => toggleSec("faceViolationAction", v as FaceViolationAction)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warn">Warning only</SelectItem>
                    <SelectItem value="flag">Flag for review</SelectItem>
                    <SelectItem value="pause">Pause exam</SelectItem>
                    <SelectItem value="terminate">Terminate exam</SelectItem>
                  </SelectContent>
                </Select>
              </div>'''

    new_block = '''              <div className="space-y-2 rounded-xl border border-slate-200 px-4 py-3">
                <Label className="font-semibold">Maximum face warnings</Label>
                <Input type="number" min={1} max={50} value={security.maxFaceWarnings ?? 5} disabled={!security.faceDetection} onChange={(e) => toggleSec("maxFaceWarnings", Number(e.target.value) || 5)} />
                <p className="text-xs text-slate-500">Face monitoring only warns the student (top banner). Strong consequences use TAB VIOLATION below.</p>
              </div>
              <p className="pt-2 text-xs font-bold uppercase tracking-wide text-slate-500">TAB VIOLATION</p>
              <div className="space-y-2 rounded-xl border border-slate-200 px-4 py-3">
                <Label className="font-semibold">TAB VIOLATION limit</Label>
                <Input type="number" min={1} max={20} value={security.maxTabSwitches} disabled={!security.tabMonitoring} onChange={(e) => toggleSec("maxTabSwitches", Number(e.target.value) || 5)} />
                <p className="text-xs text-slate-500">Before the limit: warning / flag only. At the limit: the consequence below.</p>
              </div>
              <div className="space-y-2 rounded-xl border border-slate-200 px-4 py-3">
                <Label className="font-semibold">TAB VIOLATION consequence (at limit)</Label>
                <Select value={security.thresholdAction || "flag"} onValueChange={(v) => toggleSec("thresholdAction", v as ExamSecuritySettings["thresholdAction"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warn">Warning only</SelectItem>
                    <SelectItem value="flag">Flag for review</SelectItem>
                    <SelectItem value="pause">Pause exam</SelectItem>
                    <SelectItem value="auto_submit">Auto-submit exam</SelectItem>
                    <SelectItem value="terminate">Terminate exam</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {security.thresholdAction === "pause" && (
                <div className="space-y-2 rounded-xl border border-slate-200 px-4 py-3">
                  <Label className="font-semibold">Pause duration (seconds)</Label>
                  <Input
                    type="number"
                    min={30}
                    max={3600}
                    step={30}
                    value={security.pauseDurationSeconds ?? 300}
                    onChange={(e) => toggleSec("pauseDurationSeconds", Math.max(30, Number(e.target.value) || 300))}
                  />
                  <p className="text-xs text-slate-500">Exact time the student must wait (e.g. 300 = 5 minutes).</p>
                </div>
              )}'''

    if old_block in t:
        t = t.replace(old_block, new_block, 1)
        print("teacher.examinations: TAB VIOLATION block ok")
    elif "TAB VIOLATION consequence (at limit)" in t:
        print("teacher.examinations: already patched")
    else:
        t = t.replace(
            "Action after repeated face violations",
            "TAB VIOLATION consequence (at limit)",
        )
        t = t.replace(
            'value={security.faceViolationAction || "flag"} onValueChange={(v) => toggleSec("faceViolationAction", v as FaceViolationAction)}',
            'value={security.thresholdAction || "flag"} onValueChange={(v) => toggleSec("thresholdAction", v as ExamSecuritySettings["thresholdAction"])}',
        )
        print("teacher.examinations: fallback label swap")

    if 'SelectItem value="auto_submit"' not in t and "Terminate exam</SelectItem>" in t:
        t = t.replace(
            '<SelectItem value="terminate">Terminate exam</SelectItem>',
            '<SelectItem value="auto_submit">Auto-submit exam</SelectItem>\n                    <SelectItem value="terminate">Terminate exam</SelectItem>',
            1,
        )
    p.write_text(t)

    # ---------- 2) ExamCameraPip: no small toasts ----------
    pip = Path("src/components/cbt/ExamCameraPip.tsx")
    c = pip.read_text()
    old_fire = '''    const copy = ALERT_COPY[kind];
    const opts = {
      id: copy.toastId,
      duration: 3200,
      className: "cbt-exam-toast",
    };
    if (copy.level === "error") {
      toast.error(copy.message, opts);
    } else {
      toast.warning(copy.message, opts);
    }
    onSecRef.current?.({
      kind,
      faceCount,
      at: new Date().toISOString(),
    });'''
    new_fire = '''    // No small sonner toasts during CBT — parent shows the top integrity banner only.
    onSecRef.current?.({
      kind,
      faceCount,
      at: new Date().toISOString(),
    });'''
    if old_fire in c:
        c = c.replace(old_fire, new_fire, 1)
        print("pip: removed small toasts")
    else:
        print("pip: fireAlert toast block not exact — soft strip")
        c = c.replace("toast.error(copy.message, opts);", "/* toast suppressed during exam */")
        c = c.replace("toast.warning(copy.message, opts);", "/* toast suppressed during exam */")

    c = c.replace(
        '''        toast.error("Camera not available. Please allow camera access to continue the exam.", {
          id: "cbt-cam-permission",
          duration: 5000,
          className: "cbt-exam-toast",
        });''',
        '''        onSecRef.current?.({
          kind: "camera_blocked",
          faceCount: null,
          at: new Date().toISOString(),
        });''',
    )
    pip.write_text(c)

    # ---------- 3) CbtExamSession ----------
    s = Path("src/components/cbt/CbtExamSession.impl.tsx")
    st = s.read_text()

    if "terminationReason" not in st:
        st = st.replace(
            "  const [doneTerminated, setDoneTerminated] = useState(false);",
            "  const [doneTerminated, setDoneTerminated] = useState(false);\n  const [terminationReason, setTerminationReason] = useState<string>(\"\");",
        )
        print("sess: terminationReason state")

    st = st.replace(
        '''  useEffect(() => {
    if (done) {
      shutdownMedia();
      setFsGate(false);
      setPaused(false);
      void leaveExamFullscreen();
    }
  }, [done, shutdownMedia]);''',
        '''  useEffect(() => {
    if (done) {
      shutdownMedia();
      setFsGate(false);
      setPaused(false);
      setWarnBanner(null);
      void leaveExamFullscreen();
    }
  }, [done, shutdownMedia]);''',
    )

    old_face = '''    if (!isViolation) return;
    if (faceWarnCountRef.current < maxW) {
      setWarnBanner(mapped.description || "Face integrity warning");
      window.setTimeout(() => setWarnBanner(null), 5000);
      return;
    }
    if (action === "warn" || action === "flag") {
      setWarnBanner(mapped.description || "Face integrity threshold reached");
      window.setTimeout(() => setWarnBanner(null), 6000);
    } else if (action === "pause") {
      setPauseReason(mapped.description || "Face integrity violation");
      setPaused(true);
    } else if (action === "terminate") {
      setDoneTerminated(true);
      void finishAttempt(true);
    }'''
    new_face = '''    if (!isViolation) return;
    // Face issues: top banner only (no small toasts). Strong actions reserved for TAB VIOLATION.
    setWarnBanner(mapped.description || "Face integrity warning");
    window.setTimeout(() => setWarnBanner(null), 5000);
    if (faceWarnCountRef.current < maxW) return;
    if (action === "flag") {
      setWarnBanner("Your examination has been flagged for review (face integrity).");
      window.setTimeout(() => setWarnBanner(null), 6000);
    }
    // Do not pause/terminate solely from face here — TAB VIOLATION owns those consequences.
'''
    if old_face in st:
        st = st.replace(old_face, new_face, 1)
        print("sess: face → banner only")

    st = st.replace(
        '''      if (action === "auto_submit") {
        void logSecurityEvent({
          schoolId, examId: id, attemptId: attemptIdRef.current, studentId,
          eventType: "TAB_AUTO_SUBMIT", severity: "high",
          description: "Tab violation threshold — auto-submitted.",
          questionIndex: index,
        });
        setDoneTerminated(true);
        void finishAttempt(true);
        return;
      }
      void logSecurityEvent({
        schoolId, examId: id, attemptId: attemptIdRef.current, studentId,
        eventType: "TAB_TERMINATION", severity: "high",
        description: "Tab violation threshold — terminated.",
        questionIndex: index,
      });
      setDoneTerminated(true);
      void finishAttempt(true);''',
        '''      if (action === "auto_submit") {
        void logSecurityEvent({
          schoolId, examId: id, attemptId: attemptIdRef.current, studentId,
          eventType: "TAB_AUTO_SUBMIT", severity: "high",
          description: "Tab violation threshold — auto-submitted.",
          questionIndex: index,
        });
        setTerminationReason("Your examination was automatically submitted because you exceeded the permitted number of tab violations.");
        setDoneTerminated(true);
        void finishAttempt(true);
        return;
      }
      void logSecurityEvent({
        schoolId, examId: id, attemptId: attemptIdRef.current, studentId,
        eventType: "TAB_TERMINATION", severity: "high",
        description: "Tab violation threshold — terminated.",
        questionIndex: index,
      });
      setTerminationReason("Your examination was terminated because you exceeded the permitted number of tab violations.");
      setDoneTerminated(true);
      void finishAttempt(true);''',
    )

    old_done = '''          <h1 className="mt-4 text-2xl font-extrabold">{previewMode ? "Preview ended" : "Examination completed"}</h1>
          <p className="mt-2 text-sm text-slate-600">
            {previewMode ? "Officer preview finished." : doneTerminated ? "Your attempt was closed." : "Your answers were submitted successfully."}
          </p>'''
    new_done = '''          <h1 className="mt-4 text-2xl font-extrabold">
            {previewMode
              ? "Preview ended"
              : doneTerminated
                ? (terminationReason.toLowerCase().includes("automatically submitted")
                    ? "Examination auto-submitted"
                    : "Examination terminated")
                : "Examination completed"}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {previewMode
              ? "Officer preview finished."
              : doneTerminated
                ? (terminationReason || "Your examination was closed due to a security rule.")
                : "Your answers were submitted successfully."}
          </p>'''
    if old_done in st:
        st = st.replace(old_done, new_done, 1)
        print("sess: done screen reasons")

    st = st.replace(
        '''  async function finishAttempt(auto = false) {
    if (done || finishingRef.current) return;
    finishingRef.current = true;
    shutdownMedia();
    setFsGate(false);
    setPaused(false);
    void leaveExamFullscreen();''',
        '''  async function finishAttempt(auto = false) {
    if (done || finishingRef.current) return;
    finishingRef.current = true;
    shutdownMedia();
    setFsGate(false);
    setPaused(false);
    setWarnBanner(null);
    void leaveExamFullscreen();''',
    )

    s.write_text(st)

    g = Path("src/components/cbt/ExamSecurityGate.tsx")
    gt = g.read_text()
    if "I have read and understood the examination instructions and security rules." not in gt:
        gt = gt.replace(
            "I have read and accept the monitoring notice and the examination rules.",
            "I have read and understood the examination instructions and security rules.",
        )
        g.write_text(gt)
        print("gate acknowledge wording")
    else:
        print("gate ok")

    Path("DEPLOY_TRIGGER.txt").write_text("cbt-ux-rules-tab-violation\n")
    print("ALL DONE")

if __name__ == "__main__":
    main()
