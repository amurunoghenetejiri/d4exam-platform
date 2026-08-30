#!/usr/bin/env python3
"""Apply student availability + CBT retake/hold/scroll fixes on top of 477e5d8 bases."""
from pathlib import Path

# ---- student.index ----
p = Path("src/routes/student.index.tsx")
t = p.read_text()
if "isExamAttemptFinished" not in t:
    t = t.replace(
        "  examAvailability,\n} from \"@/lib/student\";",
        "  examAvailability,\n  isExamAttemptFinished,\n} from \"@/lib/student\";",
    )
t = t.replace(
"""  function isStudentFinished(examId: string): boolean {
    if (finishedByResult.has(examId)) return true;
    const st = String(attemptsByExam.get(examId) || "").toLowerCase();
    return DONE_ATTEMPT.includes(st);
  }""",
"""  function isStudentFinished(examId: string): boolean {
    return isExamAttemptFinished(attemptsByExam.get(examId), finishedByResult.has(examId));
  }""")
t = t.replace(
    "      if (DONE_ATTEMPT.includes(String(a.status).toLowerCase())) ids.add(a.exam_id);",
    "      if (isExamAttemptFinished(a.status, finishedByResult.has(a.exam_id))) ids.add(a.exam_id);",
)
t = t.replace(
"""      if (isStudentFinished(e.id)) continue;
      if (isWriting(e.id)) continue;
      if (["completed", "closed", "cancelled"].includes(String(e.status).toLowerCase())) continue;""",
"""      if (isStudentFinished(e.id)) continue;
      if (["completed", "closed", "cancelled"].includes(String(e.status).toLowerCase())) continue;""")
p.write_text(t)
print("index ok", t.count("isExamAttemptFinished"))

# ---- examinations ----
p = Path("src/routes/student.examinations.tsx")
t = p.read_text()
if "isExamAttemptFinished" not in t:
    t = t.replace(
        "  examAvailability,\n  formatExamWindow,\n} from \"@/lib/student\";",
        "  examAvailability,\n  formatExamWindow,\n  isExamAttemptFinished,\n} from \"@/lib/student\";",
    )
old = """      const attemptDone =
        attempt && DONE_ATTEMPT_STATUSES.includes((attempt.status || "").toLowerCase());
      const studentFinished = Boolean(attemptDone || hasResult);

      if (studentFinished || ["completed", "closed"].includes(String(e.status).toLowerCase())) {
        doneList.push(e);
        continue;
      }

      const avail = examAvailability(e.status, e.scheduled_start, e.scheduled_end);
      if (avail === "available") {
        liveList.push(e);
      } else if (avail === "missed") {
        doneList.push(e);
      } else if (avail === "upcoming") {
        upList.push(e);
      } else {
        doneList.push(e);
      }"""
new = """      const studentFinished = isExamAttemptFinished(attempt?.status, hasResult);

      if (studentFinished || ["completed", "closed", "cancelled"].includes(String(e.status).toLowerCase())) {
        doneList.push(e);
        continue;
      }

      const avail = examAvailability(e.status, e.scheduled_start, e.scheduled_end);
      if (avail === "available") {
        liveList.push(e);
      } else if (avail === "missed" || avail === "ended") {
        doneList.push(e);
      } else if (avail === "upcoming") {
        upList.push(e);
      } else {
        doneList.push(e);
      }"""
if old in t:
    t = t.replace(old, new)
old = """        const attemptDone =
          attempt && DONE_ATTEMPT_STATUSES.includes((attempt.status || "").toLowerCase());
        const studentFinished = Boolean(attemptDone || resultId);
        const avail = examAvailability(e.status, e.scheduled_start, e.scheduled_end);
        const badge = studentFinished
          ? attempt?.status === "terminated"
            ? "terminated"
            : "completed"
          : avail === "missed"
            ? "missed"
            : String(e.status).replaceAll("_", " ");"""
new = """        const studentFinished = isExamAttemptFinished(attempt?.status, Boolean(resultId));
        const avail = examAvailability(e.status, e.scheduled_start, e.scheduled_end);
        const badge = studentFinished
          ? attempt?.status === "terminated"
            ? "terminated"
            : attempt?.status === "flagged"
              ? "flagged"
              : "completed"
          : avail === "missed" || avail === "ended"
            ? "missed"
            : String(e.status).replaceAll("_", " ");"""
if old in t:
    t = t.replace(old, new)
p.write_text(t)
print("exam ok", t.count("isExamAttemptFinished"))

# ---- CbtExamSession ----
p = Path("src/components/cbt/CbtExamSession.impl.tsx")
t = p.read_text()
if "holdExamScreenShare" not in t:
    t = t.replace(
        'import { startScreenShareStream, onScreenShareEnded, stopScreenShareStream } from "@/lib/screen-share";',
        'import { startScreenShareStream, onScreenShareEnded, stopScreenShareStream, holdExamScreenShare } from "@/lib/screen-share";',
    )
if "isExamAttemptFinished" not in t:
    t = t.replace(
        'import { useLiveCamPublish } from "@/lib/use-live-cam-publish";',
        'import { useLiveCamPublish } from "@/lib/use-live-cam-publish";\nimport { isExamAttemptFinished } from "@/lib/student";',
    )
if "priorAttemptQ" not in t:
    anchor = '  const security = useMemo(() => fromExamSettingsRow(settingsQ.data, examQ.data?.description), [settingsQ.data, examQ.data?.description]);'
    prior = '''  const priorAttemptQ = useQuery({
    queryKey: ["cbt-prior-attempt", id, student?.studentId],
    enabled: Boolean(id && student?.studentId && !previewMode),
    queryFn: async () => {
      const { data: attempt } = await supabase
        .from("exam_attempts")
        .select("id, status")
        .eq("exam_id", id)
        .eq("student_id", student!.studentId)
        .maybeSingle();
      const { data: result } = await supabase
        .from("results")
        .select("id")
        .eq("exam_id", id)
        .eq("student_id", student!.studentId)
        .maybeSingle();
      return {
        attemptStatus: (attempt?.status as string | undefined) ?? null,
        hasResult: Boolean(result?.id),
        attemptId: (attempt?.id as string | undefined) ?? null,
      };
    },
  });

  const alreadyFinished = !previewMode && isExamAttemptFinished(
    priorAttemptQ.data?.attemptStatus,
    priorAttemptQ.data?.hasResult,
  );

  const security = useMemo(() => fromExamSettingsRow(settingsQ.data, examQ.data?.description), [settingsQ.data, examQ.data?.description]);'''
    if anchor in t:
        t = t.replace(anchor, prior)
if "holdExamScreenShare(false)" not in t:
    t = t.replace(
"""  const shutdownMedia = useCallback(() => {
    stopMediaStream(mediaStreamRef.current);
    mediaStreamRef.current = null;
    setLiveStream(null);
    try { stopScreenShareStream(screenStreamRef.current); } catch { /* ignore */ }
    screenStreamRef.current = null;
    setScreenStream(null);
  }, []);""",
"""  const shutdownMedia = useCallback(() => {
    holdExamScreenShare(false);
    stopMediaStream(mediaStreamRef.current);
    mediaStreamRef.current = null;
    setLiveStream(null);
    try { stopScreenShareStream(screenStreamRef.current); } catch { /* ignore */ }
    screenStreamRef.current = null;
    setScreenStream(null);
  }, []);""")
if "holdExamScreenShare(true)" not in t:
    t = t.replace(
"""      const needScreen = Boolean(security.requireScreenShare) && !_opts.skipScreenShare;
      if (needScreen) {
        const share = await startScreenShareStream();
        if (!share.ok) {
          toast.error(share.message || "Screen sharing is required for this examination.");
          return;
        }
        try { stopScreenShareStream(screenStreamRef.current); } catch { /* ignore */ }
        screenStreamRef.current = share.stream;
        setScreenStream(share.stream);""",
"""      const needScreen = Boolean(security.requireScreenShare) && !_opts.skipScreenShare;
      if (needScreen) {
        holdExamScreenShare(true);
        const share = await startScreenShareStream();
        if (!share.ok) {
          holdExamScreenShare(false);
          toast.error(share.message || "Screen sharing is required for this examination.");
          return;
        }
        // reuse keeps MediaProjection alive across Gate → CBT navigation
        screenStreamRef.current = share.stream;
        setScreenStream(share.stream);""")
if "Examination already completed" not in t:
    t = t.replace(
"""  if (!started) {
    return (
      <ExamSecurityGate""",
"""  if (alreadyFinished) {
    return (
      <div className=\"grid min-h-dvh place-items-center bg-slate-50 p-4\">
        <div className=\"w-full max-w-lg rounded-2xl border bg-white p-6 text-center shadow-sm\">
          <SchoolLogo logoUrl={schoolBrand?.logoUrl ?? session?.schoolLogoUrl} schoolName={schoolBrand?.name ?? session?.schoolName} size=\"lg\" className=\"mx-auto\" />
          <h1 className=\"mt-4 text-2xl font-extrabold\">Examination already completed</h1>
          <p className=\"mt-2 text-sm text-slate-600\">
            You have already submitted or finished this examination. Retakes are not allowed.
          </p>
          <div className=\"mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center\">
            <Button className=\"font-semibold\" onClick={() => void goToResult()}>View Results</Button>
            <Button variant=\"outline\" className=\"font-semibold\" asChild>
              <Link to=\"/student/examinations\">Back to examinations</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }
  if (!started) {
    return (
      <ExamSecurityGate""")
t = t.replace(
    '    <div className="flex min-h-dvh flex-col bg-slate-50 select-none">',
    '    <div className="flex h-dvh flex-col overflow-hidden bg-slate-50 select-none">',
    1,
)
t = t.replace(
    '      <div className="mx-auto grid w-full max-w-[1200px] flex-1 grid-cols-1 gap-4 p-3 pt-[calc(4rem+0.75rem)] sm:p-6 sm:pt-[calc(4rem+1.5rem)] lg:grid-cols-[220px_1fr]">',
    '      <div className="mx-auto grid w-full max-w-[1200px] min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-3 pt-[calc(4rem+0.75rem)] sm:p-6 sm:pt-[calc(4rem+1.5rem)] lg:grid-cols-[220px_1fr]">',
)
t = t.replace(
    '        <section className="order-1 flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:order-2">',
    '        <section className="order-1 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:order-2">',
)
if "min-h-0 flex-1 overflow-y-auto" not in t:
    t = t.replace(
        '          <h1 className="mt-4 text-lg font-bold leading-snug text-slate-900 sm:text-xl">{q?.question_text}</h1>',
        '          <div className="min-h-0 flex-1 overflow-y-auto">\n          <h1 className="mt-4 text-lg font-bold leading-snug text-slate-900 sm:text-xl">{q?.question_text}</h1>',
    )
    t = t.replace(
        '          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">',
        '          </div>\n          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">',
    )
p.write_text(t)
print("cbt ok", t.count("holdExamScreenShare"), t.count("priorAttemptQ"), t.count("alreadyFinished"))
