#!/usr/bin/env python3
"""Save questions_to_answer on examinations; students see approved exams live; CBT uses configured count."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

TEACHER = ROOT / "src/routes/teacher.examinations.tsx"
t = TEACHER.read_text()
old_payload = """      const payload = {
        school_id: teacher.schoolId,
        course_id: courseId,
        created_by: session.userId,
        title: title.trim(),
        description: desc,
        duration_minutes: durationMinutes,
        scheduled_start: startAt ? new Date(startAt).toISOString() : null,
        scheduled_end: computedEnd ? new Date(computedEnd).toISOString() : null,
        status,
      };"""
new_payload = """      const payload = {
        school_id: teacher.schoolId,
        course_id: courseId,
        created_by: session.userId,
        title: title.trim(),
        description: desc,
        duration_minutes: durationMinutes,
        scheduled_start: startAt ? new Date(startAt).toISOString() : null,
        scheduled_end: computedEnd ? new Date(computedEnd).toISOString() : null,
        status,
        questions_to_answer: questionsToAnswer > 0 ? questionsToAnswer : null,
      };"""
if old_payload in t:
    t = t.replace(old_payload, new_payload, 1)
    print("OK: teacher payload")
else:
    print("FAIL: teacher payload")

old_submit = """      const { error } = await supabase
        .from("examinations")
        .update({ status: "pending_approval", description: desc } as never)
        .eq("id", id)
        .eq("school_id", teacher.schoolId);"""
new_submit = """      const { error } = await supabase
        .from("examinations")
        .update({
          status: "pending_approval",
          description: desc,
          questions_to_answer:
            meta.questionsToAnswer && meta.questionsToAnswer > 0
              ? meta.questionsToAnswer
              : null,
        } as never)
        .eq("id", id)
        .eq("school_id", teacher.schoolId);"""
if old_submit in t:
    t = t.replace(old_submit, new_submit, 1)
    print("OK: teacher submitExisting")
else:
    print("FAIL: teacher submitExisting")

TEACHER.write_text(t)

CBT = ROOT / "src/components/cbt/CbtExamSession.impl.tsx"
c = CBT.read_text()
old_sel = '.select("id, title, status, duration_minutes, scheduled_start, scheduled_end, course_id, school_id, description, courses(code, name)")'
new_sel = '.select("id, title, status, duration_minutes, scheduled_start, scheduled_end, course_id, school_id, description, questions_to_answer, courses(code, name)")'
if old_sel in c:
    c = c.replace(old_sel, new_sel, 1)
    print("OK: cbt exam select")
else:
    print("FAIL: cbt exam select")

old_qta = """  const questionsToAnswer = useMemo(() => {
    const row = (settingsQ.data as { questions_to_answer?: number } | null)?.questions_to_answer;
    if (typeof row === "number" && row > 0) return Math.floor(row);
    const meta = parseExamMeta(examQ.data?.description);
    return meta.questionsToAnswer && meta.questionsToAnswer > 0 ? meta.questionsToAnswer : null;
  }, [settingsQ.data, examQ.data?.description]);"""

new_qta = """  const questionsToAnswer = useMemo(() => {
    const fromExam = (examQ.data as { questions_to_answer?: number | null } | null)?.questions_to_answer;
    if (typeof fromExam === "number" && fromExam > 0) return Math.floor(fromExam);
    const row = (settingsQ.data as { questions_to_answer?: number } | null)?.questions_to_answer;
    if (typeof row === "number" && row > 0) return Math.floor(row);
    const meta = parseExamMeta(examQ.data?.description);
    return meta.questionsToAnswer && meta.questionsToAnswer > 0 ? meta.questionsToAnswer : null;
  }, [examQ.data, settingsQ.data, examQ.data?.description]);"""

if old_qta in c:
    c = c.replace(old_qta, new_qta, 1)
    print("OK: cbt questionsToAnswer")
else:
    print("FAIL: cbt questionsToAnswer")

CBT.write_text(c)

AP = ROOT / "src/routes/officer.approvals.tsx"
a = AP.read_text()
a = a.replace(
    '"id, title, status, duration_minutes, scheduled_start, scheduled_end, description, course_id, created_by, created_at, courses(code, name)"',
    '"id, title, status, duration_minutes, scheduled_start, scheduled_end, description, course_id, created_by, created_at, questions_to_answer, courses(code, name)"',
)
a = a.replace(
    '"id, title, status, duration_minutes, scheduled_start, scheduled_end, description, course_id, created_by, created_at"',
    '"id, title, status, duration_minutes, scheduled_start, scheduled_end, description, course_id, created_by, created_at, questions_to_answer"',
)
if "questions_to_answer?:" not in a:
    a = a.replace(
        """type ExamRow = {
  id: string;
  title: string;
  status: string;
  duration_minutes: number;
  scheduled_start: string | null;
  scheduled_end: string | null;
  description: string | null;
  course_id: string | null;
  created_by: string | null;
  created_at: string;
  courses: { code: string; name: string } | null;
};""",
        """type ExamRow = {
  id: string;
  title: string;
  status: string;
  duration_minutes: number;
  scheduled_start: string | null;
  scheduled_end: string | null;
  description: string | null;
  course_id: string | null;
  created_by: string | null;
  created_at: string;
  questions_to_answer?: number | null;
  courses: { code: string; name: string } | null;
};""",
    )
a, n = re.subn(
    r"function questionsToAnswerFor\(item: ExamRow\): number \| null \{.*?\n  \}",
    """function questionsToAnswerFor(item: ExamRow): number | null {
    if (typeof item.questions_to_answer === "number" && item.questions_to_answer > 0) {
      return Math.floor(item.questions_to_answer);
    }
    const fromSettings = settingsMap[item.id]?.questions_to_answer;
    if (typeof fromSettings === "number" && fromSettings > 0) return Math.floor(fromSettings);
    const meta = parseExamMeta(item.description);
    if (meta.questionsToAnswer && meta.questionsToAnswer > 0) return meta.questionsToAnswer;
    const sec = parseSecurityFromDescription(item.description);
    if (sec?.questionsToAnswer && sec.questionsToAnswer > 0) return sec.questionsToAnswer;
    return null;
  }""",
    a,
    count=1,
    flags=re.S,
)
print("OK: officer questionsToAnswerFor", n)
AP.write_text(a)

SE = ROOT / "src/routes/student.examinations.tsx"
s = SE.read_text()
s = s.replace(
    """    queryKey: ["student-exams", schoolId, student?.courseIds?.join(",")],
    enabled: Boolean(schoolId),
    staleTime: 10_000,
    refetchOnMount: "always",""",
    """    queryKey: ["student-exams", schoolId, student?.courseIds?.join(",")],
    enabled: Boolean(schoolId),
    staleTime: 2_000,
    refetchInterval: 5_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,""",
)
SE.write_text(s)
print("OK: student exams live")
print("DONE")
