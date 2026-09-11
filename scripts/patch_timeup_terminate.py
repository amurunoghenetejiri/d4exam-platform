#!/usr/bin/env python3
"""Time-up CTA on dashboard; terminate = no results + danger UI; fix finishAttempt race."""
from pathlib import Path

def patch_student_index():
    p = Path("src/routes/student.index.tsx")
    t = p.read_text()
    old = '''                    {isWriting(e.id) ? (
                      <Button
                        size="sm"
                        className="h-8 shrink-0 bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700 sm:text-sm"
                        type="button"
                        onClick={() => {
                          void navigate({
                            to: "/student/exam/$id",
                            params: { id: e.id },
                          });
                        }}
                      >
                        {(() => {
                          const ea = endsAtByExam.get(e.id);
                          if (!ea) return "Continue";
                          const left = Math.max(0, new Date(ea).getTime() - nowTick);
                          if (left <= 0) return "Continue";
                          return `Continue · ${formatLeft(left)}`;
                        })()}
                      </Button>
                    ) : canStart ? ('''
    new = '''                    {isWriting(e.id) ? (
                      (() => {
                        const ea = endsAtByExam.get(e.id);
                        const left = ea ? Math.max(0, new Date(ea).getTime() - nowTick) : null;
                        const timeUp = left != null && left <= 0;
                        return (
                      <Button
                        size="sm"
                        className={
                          timeUp
                            ? "h-8 shrink-0 bg-red-600 px-3 text-xs font-bold text-white hover:bg-red-700 sm:text-sm"
                            : "h-8 shrink-0 bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700 sm:text-sm"
                        }
                        type="button"
                        onClick={() => {
                          if (timeUp) {
                            const hasResult = finishedByResult.has(e.id);
                            if (hasResult) {
                              void navigate({ to: "/student/results/$id", params: { id: e.id } });
                            } else {
                              void navigate({ to: "/student/exam/$id", params: { id: e.id } });
                            }
                            return;
                          }
                          void navigate({
                            to: "/student/exam/$id",
                            params: { id: e.id },
                          });
                        }}
                      >
                        {timeUp
                          ? "Time up · 00:00:00"
                          : left != null
                            ? `Continue · ${formatLeft(left)}`
                            : "Continue"}
                      </Button>
                        );
                      })()
                    ) : canStart ? ('''
    if old in t:
        t = t.replace(old, new)
        print("student.index: Time up button")
    else:
        print("student.index: WARN pattern not found")
    p.write_text(t)
    print("student.index", len(t))


def patch_student_exams():
    p = Path("src/routes/student.examinations.tsx")
    if not p.exists():
        print("student.examinations missing")
        return
    t = p.read_text()
    old = '''function StartExamButton({ examId, continueMode, remainingMs }: { examId: string; continueMode?: boolean; remainingMs?: number | null }) {
  const navigate = useNavigate();
  const label = continueMode
    ? (remainingMs != null && remainingMs > 0
        ? `Continue · ${formatCountdown(remainingMs)} left`
        : "Continue exam")
    : "Start exam";
  return (
    <Button
      type="button"
      size="sm"
      className={continueMode ? "h-9 w-full bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 sm:h-8 sm:w-auto" : "h-9 w-full bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90 sm:h-8 sm:w-auto"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          window.alert("Connect to the internet to write this exam.");
          return;
        }
        void navigate({ to: "/student/exam/$id", params: { id: examId } });
      }}
    >
      {label}
    </Button>
  );
}'''
    new = '''function StartExamButton({ examId, continueMode, remainingMs, hasResult }: { examId: string; continueMode?: boolean; remainingMs?: number | null; hasResult?: boolean }) {
  const navigate = useNavigate();
  const timeUp = Boolean(continueMode && remainingMs != null && remainingMs <= 0);
  const label = continueMode
    ? (timeUp
        ? "Time up · 00:00:00"
        : remainingMs != null && remainingMs > 0
          ? `Continue · ${formatCountdown(remainingMs)} left`
          : "Continue exam")
    : "Start exam";
  return (
    <Button
      type="button"
      size="sm"
      className={
        timeUp
          ? "h-9 w-full bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700 sm:h-8 sm:w-auto"
          : continueMode
            ? "h-9 w-full bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 sm:h-8 sm:w-auto"
            : "h-9 w-full bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90 sm:h-8 sm:w-auto"
      }
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          window.alert("Connect to the internet to write this exam.");
          return;
        }
        if (timeUp) {
          if (hasResult) {
            void navigate({ to: "/student/results/$id", params: { id: examId } });
          } else {
            void navigate({ to: "/student/exam/$id", params: { id: examId } });
          }
          return;
        }
        void navigate({ to: "/student/exam/$id", params: { id: examId } });
      }}
    >
      {label}
    </Button>
  );
}'''
    if old in t:
        t = t.replace(old, new)
        print("student.examinations: StartExamButton Time up")
    else:
        print("student.examinations: WARN StartExamButton not found")
    p.write_text(t)
    print("student.examinations", len(t))


def patch_cbt():
    p = Path("src/components/cbt/CbtExamSession.impl.tsx")
    t = p.read_text()
    assert len(t) > 40000

    if "doneTerminatedRef" not in t:
        t = t.replace(
            "const [doneTerminated, setDoneTerminated] = useState(false);",
            "const [doneTerminated, setDoneTerminated] = useState(false);\n"
            "  const doneTerminatedRef = useRef(false);\n"
            "  doneTerminatedRef.current = doneTerminated;",
        )
        print("cbt: doneTerminatedRef")

    t = t.replace(
        """      } else if (cmd === "terminate") {
        setDoneTerminated(true);
        setDoneForceSubmit(false);
        setPaused(false);
        try { haptic("officer_submit"); } catch { /* ignore */ }
        void finishAttempt(true);
      } else if (cmd === "submit") {
        setDoneTerminated(false);
        setDoneForceSubmit(true);
        setPaused(false);
        try { haptic("officer_submit"); } catch { /* ignore */ }
        void finishAttempt(false);
      }""",
        """      } else if (cmd === "terminate") {
        doneTerminatedRef.current = true;
        setDoneTerminated(true);
        setDoneForceSubmit(false);
        setPaused(false);
        try { haptic("officer_submit"); } catch { /* ignore */ }
        void finishAttempt(true, "terminate");
      } else if (cmd === "submit") {
        doneTerminatedRef.current = false;
        setDoneTerminated(false);
        setDoneForceSubmit(true);
        setPaused(false);
        try { haptic("officer_submit"); } catch { /* ignore */ }
        void finishAttempt(false, "auto_submit");
      }""",
    )

    t = t.replace(
        """        if (st === "terminated") {
          setDoneTerminated(true);
          void finishAttempt(true);
          return;
        }""",
        """        if (st === "terminated") {
          doneTerminatedRef.current = true;
          setDoneTerminated(true);
          void finishAttempt(true, "terminate");
          return;
        }""",
    )

    t = t.replace(
        """      } else if (action === "terminate" || action === "auto_submit" || action === "submit") {
        setDoneTerminated(action === "terminate");
        await finishAttempt(true);
      }""",
        """      } else if (action === "terminate") {
        doneTerminatedRef.current = true;
        setDoneTerminated(true);
        await finishAttempt(true, "terminate");
      } else if (action === "auto_submit" || action === "submit") {
        doneTerminatedRef.current = false;
        setDoneTerminated(false);
        await finishAttempt(true, "auto_submit");
      }""",
    )

    old_timer = """      if (left <= 0 && !finishingRef.current && !doneRef.current) {
        void finishAttempt(true);
      }"""
    new_timer = """      if (left <= 0 && !finishingRef.current && !doneRef.current) {
        doneTerminatedRef.current = false;
        setDoneTerminated(false);
        void finishAttempt(true, "auto_submit");
      }"""
    if old_timer in t:
        t = t.replace(old_timer, new_timer)
        print("cbt: timer auto_submit")

    old_fn_start = '''  async function finishAttempt(auto = false, mode: "submit" | "terminate" | "auto_submit" = auto ? "terminate" : "submit") {
    if (done || finishingRef.current) return;
    finishingRef.current = true;
    try { haptic("officer_submit"); } catch { /* ignore */ }
    doneRef.current = true;
    setFsGate(false);
    setPaused(false);
    setDone(true); // immediate UI exit — no camera reconnect flash
    shutdownMedia();
    void leaveExamFullscreen();
    if (previewMode) {
      toast.message("Preview ended — nothing was saved");
      finishingRef.current = false;
      return;
    }
    try {
      if (student?.studentId && examQ.data) {
        let attemptId = attemptIdRef.current;
        if (!attemptId) {
          const { data } = await supabase.from("exam_attempts").upsert({
            exam_id: id, student_id: student.studentId, school_id: examQ.data?.school_id,
            status: "in_progress", started_at: new Date().toISOString(), answers,
          } as never, { onConflict: "exam_id,student_id" }).select("id").maybeSingle();
          attemptId = (data?.id as string) ?? null;
          attemptIdRef.current = attemptId;
        }
        const schoolId = String(examQ.data.school_id ?? student.schoolId ?? "");
        const saved = await saveCbtResult({
          examId: id, studentId: student.studentId, schoolId, attemptId,
          questions: questions.map((qq) => ({
            id: qq.id, marks: qq.marks ?? 1, correct_answer: qq.correct_answer,
            options: qq.options ?? [],
            originalOptions: (qq as { originalOptions?: string[] }).originalOptions ?? [],
            correctOptionText: (qq as { correctOptionText?: string | null }).correctOptionText ?? null,
          })),
          answers: answersRef.current, terminated: doneTerminated, resultVisibility: security.resultVisibility,
        });
        if (saved.error) toast.error(saved.error.message);
        else {
          let rid = saved.resultId ?? null;
          if (!rid) {
            const { data: res } = await supabase.from("results").select("id").eq("exam_id", id).eq("student_id", student.studentId).maybeSingle();
            rid = (res?.id as string) ?? null;
          }
          if (rid) { setResultId(rid); resultIdRef.current = rid; }
          toast.success(saved.published ? "Examination submitted — result is available now" : "Examination submitted successfully");
        }'''

    new_fn_start = '''  async function finishAttempt(auto = false, mode: "submit" | "terminate" | "auto_submit" = auto ? "auto_submit" : "submit") {
    if (done || finishingRef.current) return;
    finishingRef.current = true;
    const isTerminated = mode === "terminate" || doneTerminatedRef.current === true;
    if (isTerminated) {
      doneTerminatedRef.current = true;
      setDoneTerminated(true);
    }
    try { haptic("officer_submit"); } catch { /* ignore */ }
    doneRef.current = true;
    setFsGate(false);
    setPaused(false);
    setDone(true); // immediate UI exit — no camera reconnect flash
    shutdownMedia();
    void leaveExamFullscreen();
    if (previewMode) {
      toast.message("Preview ended — nothing was saved");
      finishingRef.current = false;
      return;
    }
    try {
      if (student?.studentId && examQ.data) {
        let attemptId = attemptIdRef.current;
        if (!attemptId) {
          const { data } = await supabase.from("exam_attempts").upsert({
            exam_id: id, student_id: student.studentId, school_id: examQ.data?.school_id,
            status: "in_progress", started_at: new Date().toISOString(), answers,
          } as never, { onConflict: "exam_id,student_id" }).select("id").maybeSingle();
          attemptId = (data?.id as string) ?? null;
          attemptIdRef.current = attemptId;
        }
        const schoolId = String(examQ.data.school_id ?? student.schoolId ?? "");
        const saved = await saveCbtResult({
          examId: id, studentId: student.studentId, school_id, attemptId,
          questions: questions.map((qq) => ({
            id: qq.id, marks: qq.marks ?? 1, correct_answer: qq.correct_answer,
            options: qq.options ?? [],
            originalOptions: (qq as { originalOptions?: string[] }).originalOptions ?? [],
            correctOptionText: (qq as { correctOptionText?: string | null }).correctOptionText ?? null,
          })),
          answers: answersRef.current, terminated: isTerminated, resultVisibility: security.resultVisibility,
        });
        if (isTerminated) {
          setResultId(null);
          resultIdRef.current = null;
        } else if (saved.error) {
          toast.error(saved.error.message);
        } else {
          let rid = saved.resultId ?? null;
          if (!rid) {
            const { data: res } = await supabase.from("results").select("id").eq("exam_id", id).eq("student_id", student.studentId).maybeSingle();
            rid = (res?.id as string) ?? null;
          }
          if (rid) { setResultId(rid); resultIdRef.current = rid; }
          toast.success(saved.published ? "Examination submitted — result is available now" : "Examination submitted successfully");
        }'''

    # fix typo school_id vs schoolId in new - use schoolId correctly
    new_fn_start = new_fn_start.replace("school_id, attemptId,", "schoolId, attemptId,")

    if old_fn_start in t:
        t = t.replace(old_fn_start, new_fn_start)
        print("cbt: finishAttempt core fixed")
    else:
        t = t.replace(
            'mode: "submit" | "terminate" | "auto_submit" = auto ? "terminate" : "submit"',
            'mode: "submit" | "terminate" | "auto_submit" = auto ? "auto_submit" : "submit"',
        )
        t = t.replace(
            "answers: answersRef.current, terminated: doneTerminated, resultVisibility: security.resultVisibility,",
            "answers: answersRef.current, terminated: (mode === \"terminate\" || doneTerminatedRef.current), resultVisibility: security.resultVisibility,",
        )
        print("cbt: partial finishAttempt fix")

    t = t.replace("setDoneTerminated(auto);", "// terminate flag set only for real terminate")
    t = t.replace("setDoneTerminated(auto)", "// terminate flag set only for real terminate")

    old_done = '''  if (done) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-50 p-4">
        <div className="w-full max-w-lg rounded-2xl border bg-white p-6 text-center shadow-sm">
          <SchoolLogo logoUrl={resolvedLogoUrl} schoolName={resolvedSchoolName} size="lg" className="mx-auto" />
          <h1 className="mt-4 text-2xl font-extrabold">
            {previewMode
              ? "Preview ended"
              : doneTerminated
                ? "EXAM TERMINATED"
                : "EXAM SUBMITTED"}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {previewMode
              ? "Officer preview finished."
              : doneTerminated
                ? "Your examination has been terminated by the examination officer for an examination violation. No result was recorded for this attempt."
                : "Your examination has been submitted. Your examination is no longer active."}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {!previewMode && (<Button className="font-semibold" onClick={() => void goToResult()}>View Results</Button>)}
            <Button variant="outline" className="font-semibold" asChild>
              <Link to={previewMode ? "/officer/approvals" : "/student/examinations"}>{previewMode ? "Back" : "Back to examinations"}</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }'''
    new_done = '''  if (done) {
    if (doneTerminated || doneTerminatedRef.current) {
      return (
        <div className="grid min-h-dvh place-items-center bg-red-50 p-4">
          <div className="w-full max-w-lg rounded-2xl border-2 border-red-300 bg-white p-6 text-center shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
              <span className="text-3xl font-black" aria-hidden>!</span>
            </div>
            <SchoolLogo logoUrl={resolvedLogoUrl} schoolName={resolvedSchoolName} size="md" className="mx-auto mt-3" />
            <h1 className="mt-4 text-2xl font-black uppercase tracking-tight text-red-700">
              Examination terminated
            </h1>
            <p className="mt-3 text-sm font-medium text-red-900/90">
              Your examination has been terminated for an examination violation.
              No result was recorded for this attempt.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Contact your examination officer if you believe this was a mistake.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button variant="outline" className="font-semibold border-red-200 text-red-800" asChild>
                <Link to={previewMode ? "/officer/approvals" : "/student/examinations"}>
                  {previewMode ? "Back" : "Back to examinations"}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-50 p-4">
        <div className="w-full max-w-lg rounded-2xl border bg-white p-6 text-center shadow-sm">
          <SchoolLogo logoUrl={resolvedLogoUrl} schoolName={resolvedSchoolName} size="lg" className="mx-auto" />
          <h1 className="mt-4 text-2xl font-extrabold">
            {previewMode ? "Preview ended" : "EXAM SUBMITTED"}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {previewMode
              ? "Officer preview finished."
              : "Your examination has been submitted. Your examination is no longer active."}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {!previewMode && (<Button className="font-semibold" onClick={() => void goToResult()}>View Results</Button>)}
            <Button variant="outline" className="font-semibold" asChild>
              <Link to={previewMode ? "/officer/approvals" : "/student/examinations"}>{previewMode ? "Back" : "Back to examinations"}</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }'''
    if old_done in t:
        t = t.replace(old_done, new_done)
        print("cbt: done terminated danger UI")
    else:
        print("cbt: WARN done UI not exact")

    old_fin = '''  if (alreadyFinished) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-50 p-4">
        <div className="w-full max-w-lg rounded-2xl border bg-white p-6 text-center shadow-sm">
          <SchoolLogo logoUrl={resolvedLogoUrl} schoolName={resolvedSchoolName} size="lg" className="mx-auto" />
          <h1 className="mt-4 text-2xl font-extrabold">Examination already completed</h1>
          <p className="mt-2 text-sm text-slate-600">
            You have already submitted or finished this examination. Retakes are not allowed.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button className="font-semibold" onClick={() => void goToResult()}>View Results</Button>
            <Button variant="outline" className="font-semibold" asChild>
              <Link to="/student/examinations">Back to examinations</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }'''
    new_fin = '''  if (alreadyFinished) {
    const priorTerminated = String(priorAttemptQ.data?.attemptStatus || "").toLowerCase() === "terminated";
    if (priorTerminated) {
      return (
        <div className="grid min-h-dvh place-items-center bg-red-50 p-4">
          <div className="w-full max-w-lg rounded-2xl border-2 border-red-300 bg-white p-6 text-center shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
              <span className="text-3xl font-black" aria-hidden>!</span>
            </div>
            <h1 className="mt-4 text-2xl font-black uppercase tracking-tight text-red-700">
              Examination terminated
            </h1>
            <p className="mt-3 text-sm font-medium text-red-900/90">
              This examination was terminated for a violation. No result is available.
            </p>
            <div className="mt-6">
              <Button variant="outline" className="font-semibold border-red-200 text-red-800" asChild>
                <Link to="/student/examinations">Back to examinations</Link>
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-50 p-4">
        <div className="w-full max-w-lg rounded-2xl border bg-white p-6 text-center shadow-sm">
          <SchoolLogo logoUrl={resolvedLogoUrl} schoolName={resolvedSchoolName} size="lg" className="mx-auto" />
          <h1 className="mt-4 text-2xl font-extrabold">Examination already completed</h1>
          <p className="mt-2 text-sm text-slate-600">
            You have already submitted or finished this examination. Retakes are not allowed.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button className="font-semibold" onClick={() => void goToResult()}>View Results</Button>
            <Button variant="outline" className="font-semibold" asChild>
              <Link to="/student/examinations">Back to examinations</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }'''
    if old_fin in t:
        t = t.replace(old_fin, new_fin)
        print("cbt: alreadyFinished terminated UI")
    else:
        print("cbt: WARN alreadyFinished not exact")

    p.write_text(t)
    print("cbt written", len(t))


def main():
    patch_student_index()
    patch_student_exams()
    patch_cbt()
    print("DONE")

if __name__ == "__main__":
    main()
