#!/usr/bin/env python3
"""Fix officer Pause/Resume button state + suppress non-exam toasts during CBT."""
from pathlib import Path

def patch_officer():
    p = Path("src/routes/officer.live-monitor.tsx")
    t = p.read_text()
    assert len(t) > 20000

    bad = (
        '? { ...row, status: "in_progress", metadata: { ...(row.metadata || {}), officer_hold: true, officer_pause: true, officer_hold_at: nowIso } }'
    )
    good = (
        '? { ...row, status: "paused", metadata: { ...(row.metadata || {}), officer_hold: true, officer_pause: true, officer_hold_at: nowIso } }'
    )
    if bad in t:
        t = t.replace(bad, good)
        print("officer: optimistic pause status -> paused")
    else:
        print("officer: optimistic pause already ok or pattern changed")

    old_cond = '''                {(["paused", "held"].includes(String(selected.a.status || "").toLowerCase())
                  || Boolean((selected.a.metadata as Record<string, unknown> | null | undefined)?.officer_pause)
                  || Boolean((selected.a.metadata as Record<string, unknown> | null | undefined)?.officer_hold)
                  || Boolean(forcePausedIds[String(selected.a.id)])
                ) ? (
                  <Button size="sm" variant="outline" className="h-8 text-xs font-semibold" disabled={actionBusy || warningBusy} onClick={() => void officerControl("release")}>
                    Resume Exam
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="h-8 text-xs font-semibold" disabled={actionBusy || warningBusy} onClick={() => void officerControl("pause")}>
                    Pause Exam
                  </Button>
                )}'''

    new_cond = '''                {(() => {
                  const st = String(selected.a.status || "").toLowerCase();
                  const meta = (selected.a.metadata || {}) as Record<string, unknown>;
                  const forced = Boolean(forcePausedIds[String(selected.a.id)]);
                  const statusPaused = st === "paused" || st === "held";
                  const metaPaused =
                    statusPaused &&
                    (meta.officer_pause === true ||
                      meta.officer_hold === true ||
                      String(meta.officer_pause || "").toLowerCase() === "true" ||
                      String(meta.officer_hold || "").toLowerCase() === "true");
                  const showResume = forced || statusPaused || metaPaused;
                  return showResume ? (
                  <Button size="sm" variant="outline" className="h-8 text-xs font-semibold" disabled={actionBusy || warningBusy} onClick={() => void officerControl("release")}>
                    Resume Exam
                  </Button>
                  ) : (
                  <Button size="sm" variant="outline" className="h-8 text-xs font-semibold" disabled={actionBusy || warningBusy} onClick={() => void officerControl("pause")}>
                    Pause Exam
                  </Button>
                  );
                })()}'''

    if old_cond in t:
        t = t.replace(old_cond, new_cond)
        print("officer: pause/resume button condition fixed")
    else:
        if "Resume Exam" in t and "Pause Exam" in t:
            print("officer: WARN button block pattern mismatch — manual check")
        else:
            print("officer: WARN pause buttons missing")

    needle = 'toast.success(`Resumed — ${selected.name} can continue`);'
    if needle in t and 'delete next[String(attemptId)]' not in t[t.find(needle):t.find(needle)+350]:
        t = t.replace(
            needle,
            needle
            + '\n        setForcePausedIds((prev) => {\n          const next = { ...prev };\n          delete next[String(attemptId)];\n          return next;\n        });',
        )
        print("officer: forcePausedIds clear on release")

    p.write_text(t)
    print("officer written", len(t))


def patch_cbt():
    p = Path("src/components/cbt/CbtExamSession.impl.tsx")
    t = p.read_text()
    assert len(t) > 40000

    marker = "  resultIdRef.current = resultId;"
    helper = marker + """
  /** Only integrity / officer messages during live exam — no generic toasts. */
  const examSafeToast = {
    message: (msg: string) => {
      if (startedRef.current && !doneRef.current) return;
      toast.message(msg);
    },
    success: (msg: string) => {
      if (startedRef.current && !doneRef.current) return;
      toast.success(msg);
    },
    error: (msg: string) => {
      if (startedRef.current && !doneRef.current) {
        setWarnBanner(msg);
        window.setTimeout(() => setWarnBanner(null), 6000);
        return;
      }
      toast.error(msg);
    },
  };"""
    if "examSafeToast" not in t and marker in t:
        t = t.replace(marker, helper, 1)
        print("cbt: examSafeToast helper")

    replacements = [
        ('toast.success("Fullscreen restored")', 'examSafeToast.success("Fullscreen restored")'),
        ('toast.error("Could not enter fullscreen. Tap again or check device permissions.")',
         'examSafeToast.error("Could not enter fullscreen. Tap again or check device permissions.")'),
        ('toast.message("Please allow fullscreen to continue the exam")',
         'examSafeToast.message("Please allow fullscreen to continue the exam")'),
        ('toast.success("Screen sharing active")', 'examSafeToast.success("Screen sharing active")'),
        ('toast.error(share.message || "Screen sharing is required for this examination.")',
         'examSafeToast.error(share.message || "Screen sharing is required for this examination.")'),
        ('toast.error("Screen sharing stopped. Re-enable to continue the exam.")',
         'setWarnBanner("Screen sharing stopped. Re-enable to continue the exam."); window.setTimeout(() => setWarnBanner(null), 6000);'),
        ('toast.success(needCam ? "Camera ready" : "Microphone ready")',
         'examSafeToast.success(needCam ? "Camera ready" : "Microphone ready")'),
        ('toast.error(needCam ? "Camera is required for this examination." : "Microphone is required for this examination.")',
         'examSafeToast.error(needCam ? "Camera is required for this examination." : "Microphone is required for this examination.")'),
    ]
    for a, b in replacements:
        if a in t:
            t = t.replace(a, b)
            print("cbt: replaced", a[:50])

    p.write_text(t)
    print("cbt written", len(t))


def main():
    patch_officer()
    patch_cbt()
    print("DONE")

if __name__ == "__main__":
    main()
