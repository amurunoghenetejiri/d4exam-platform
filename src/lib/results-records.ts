/**
 * Role-scoped result records for D4EXAM.
 * Security: filters applied on every query using session role + school/department/course scope.
 */
import { supabase } from "@/integrations/supabase/client";
import { parseExamMeta, assessmentKindLabel, type AssessmentKind } from "@/lib/exam-meta";
import { gradeFromPercentage } from "@/lib/cbt-security";
import type { AppRole, SessionUser } from "@/lib/session";

export type ResultsScope = "super_admin" | "school_admin" | "examination_officer" | "teacher";

export type ResultFilters = {
  schoolId?: string | null;
  sessionId?: string | null;
  semesterId?: string | null;
  departmentId?: string | null;
  levelId?: string | null;
  courseId?: string | null;
  assessment?: "all" | "test" | "examination";
  examId?: string | null;
};

export type ExamRecordHeader = {
  examId: string;
  title: string;
  courseCode: string;
  courseName: string;
  departmentName: string;
  levelName: string;
  semesterName: string;
  sessionName: string;
  assessment: AssessmentKind;
  assessmentLabel: string;
  dateLabel: string;
  maxScore: number | null;
  schoolName: string | null;
};

export type ResultStudentRow = {
  resultId: string;
  studentId: string;
  fullName: string;
  matric: string;
  departmentName: string;
  levelName: string;
  score: number | null;
  maxScore: number | null;
  grade: string | null;
  isCarryover: boolean;
  percentage: number | null;
};

export type NamedOption = { id: string; name: string; extra?: string };

function scopeFromRole(role: AppRole | null | undefined): ResultsScope | null {
  if (role === "super_admin") return "super_admin";
  if (role === "school_admin") return "school_admin";
  if (role === "examination_officer") return "examination_officer";
  if (role === "teacher") return "teacher";
  return null;
}

export async function resolveOfficerDepartmentId(
  schoolId: string,
  profileId: string | null,
): Promise<string | null> {
  if (!profileId) return null;
  try {
    const { data } = await supabase
      .from("examination_officers")
      .select("department_id")
      .eq("school_id", schoolId)
      .eq("profile_id", profileId)
      .maybeSingle();
    return (data as { department_id?: string | null } | null)?.department_id ?? null;
  } catch {
    return null;
  }
}

export async function resolveTeacherCourseIds(
  schoolId: string,
  profileId: string | null,
): Promise<string[]> {
  if (!profileId) return [];
  try {
    const { data: teacher } = await supabase
      .from("teachers")
      .select("id")
      .eq("school_id", schoolId)
      .eq("profile_id", profileId)
      .maybeSingle();
    if (!teacher?.id) return [];
    const { data: links } = await supabase
      .from("teacher_courses")
      .select("course_id")
      .eq("teacher_id", teacher.id);
    return (links ?? []).map((l) => String(l.course_id)).filter(Boolean);
  } catch {
    return [];
  }
}

/** List exams the current user may see, with optional filters. */
export async function loadScopedExams(
  user: SessionUser,
  filters: ResultFilters,
): Promise<
  Array<{
    id: string;
    title: string;
    status: string;
    course_id: string | null;
    scheduled_start: string | null;
    description: string | null;
    school_id: string;
    courses: {
      code: string;
      name: string;
      department_id: string | null;
      level_id: string | null;
      semester_id: string | null;
    } | null;
  }>
> {
  const scope = scopeFromRole(user.role);
  if (!scope) return [];

  let schoolId = filters.schoolId || user.schoolId;
  if (scope !== "super_admin" && !schoolId) return [];

  let q = supabase
    .from("examinations")
    .select(
      "id, title, status, course_id, scheduled_start, description, school_id, courses(code, name, department_id, level_id, semester_id)",
    )
    .order("scheduled_start", { ascending: false })
    .limit(400);

  if (schoolId) q = q.eq("school_id", schoolId);

  const { data, error } = await q;
  if (error || !data) return [];

  let rows = data as never as Array<{
    id: string;
    title: string;
    status: string;
    course_id: string | null;
    scheduled_start: string | null;
    description: string | null;
    school_id: string;
    courses: {
      code: string;
      name: string;
      department_id: string | null;
      level_id: string | null;
      semester_id: string | null;
    } | null;
  }>;

  // Teacher: only assigned courses or exams they created
  if (scope === "teacher") {
    const courseIds = await resolveTeacherCourseIds(schoolId!, user.profileId);
    rows = rows.filter(
      (e) =>
        (e.course_id && courseIds.includes(e.course_id)) ||
        // created_by not always selected — course assignment is primary
        Boolean(e.course_id && courseIds.includes(String(e.course_id))),
    );
  }

  // Officer: department of course must match officer department
  if (scope === "examination_officer") {
    const deptId = await resolveOfficerDepartmentId(schoolId!, user.profileId);
    if (deptId) {
      rows = rows.filter((e) => !e.courses?.department_id || e.courses.department_id === deptId);
    }
  }

  // Filters
  if (filters.courseId) {
    rows = rows.filter((e) => e.course_id === filters.courseId);
  }
  if (filters.departmentId) {
    rows = rows.filter((e) => e.courses?.department_id === filters.departmentId);
  }
  if (filters.levelId) {
    rows = rows.filter((e) => e.courses?.level_id === filters.levelId);
  }
  if (filters.semesterId) {
    rows = rows.filter((e) => e.courses?.semester_id === filters.semesterId);
  }
  if (filters.assessment && filters.assessment !== "all") {
    rows = rows.filter((e) => {
      const kind = parseExamMeta(e.description).assessmentKind || "examination";
      if (filters.assessment === "test") return kind === "test";
      return kind === "examination" || kind === "assignment";
    });
  }
  if (filters.examId) {
    rows = rows.filter((e) => e.id === filters.examId);
  }

  // Semester filter via session: if sessionId set, filter courses whose semester belongs to session
  if (filters.sessionId && schoolId) {
    try {
      const { data: sems } = await supabase
        .from("semesters")
        .select("id")
        .eq("school_id", schoolId)
        .eq("academic_session_id", filters.sessionId);
      const semIds = new Set((sems ?? []).map((s) => s.id));
      if (semIds.size) {
        rows = rows.filter((e) => e.courses?.semester_id && semIds.has(e.courses.semester_id));
      }
    } catch {
      /* ignore */
    }
  }

  return rows;
}

export async function loadExamResultRecord(
  user: SessionUser,
  examId: string,
): Promise<{ header: ExamRecordHeader; rows: ResultStudentRow[]; assessment: AssessmentKind } | null> {
  const scope = scopeFromRole(user.role);
  if (!scope) return null;

  const { data: exam, error } = await supabase
    .from("examinations")
    .select(
      "id, title, description, school_id, course_id, scheduled_start, scheduled_end, courses(code, name, department_id, level_id, semester_id, departments(name), levels(name), semesters(name, academic_session_id, academic_sessions(name)))",
    )
    .eq("id", examId)
    .maybeSingle();

  if (error || !exam) return null;

  const schoolId = String((exam as { school_id: string }).school_id);
  if (scope !== "super_admin" && user.schoolId && user.schoolId !== schoolId) return null;

  // Scope checks
  if (scope === "teacher") {
    const courseIds = await resolveTeacherCourseIds(schoolId, user.profileId);
    const cid = (exam as { course_id?: string | null }).course_id;
    if (cid && !courseIds.includes(cid)) return null;
  }
  if (scope === "examination_officer") {
    const deptId = await resolveOfficerDepartmentId(schoolId, user.profileId);
    const courseDept = (exam as { courses?: { department_id?: string | null } }).courses?.department_id;
    if (deptId && courseDept && courseDept !== deptId) return null;
  }

  const meta = parseExamMeta((exam as { description?: string | null }).description);
  const assessment = (meta.assessmentKind || "examination") as AssessmentKind;

  const courses = (exam as {
    courses?: {
      code?: string;
      name?: string;
      department_id?: string | null;
      level_id?: string | null;
      semester_id?: string | null;
      departments?: { name?: string } | { name?: string }[] | null;
      levels?: { name?: string } | { name?: string }[] | null;
      semesters?:
        | {
            name?: string;
            academic_session_id?: string | null;
            academic_sessions?: { name?: string } | { name?: string }[] | null;
          }
        | {
            name?: string;
            academic_session_id?: string | null;
            academic_sessions?: { name?: string } | { name?: string }[] | null;
          }[]
        | null;
    } | null;
  }).courses;

  const one = <T,>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? v[0] ?? null : v ?? null;

  const dept = one(courses?.departments);
  const level = one(courses?.levels);
  const sem = one(courses?.semesters);
  const sess = one(sem?.academic_sessions as { name?: string } | { name?: string }[] | null | undefined);

  let schoolName: string | null = user.schoolName;
  try {
    const { data: sch } = await supabase.from("schools").select("name").eq("id", schoolId).maybeSingle();
    if (sch?.name) schoolName = sch.name;
  } catch {
    /* ignore */
  }

  const dateIso =
    (exam as { scheduled_end?: string | null }).scheduled_end ||
    (exam as { scheduled_start?: string | null }).scheduled_start ||
    null;
  let dateLabel = "—";
  if (dateIso) {
    try {
      dateLabel = new Date(dateIso).toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      dateLabel = dateIso;
    }
  }

  // Results
  const { data: results } = await supabase
    .from("results")
    .select(
      "id, student_id, total_score, max_score, percentage, grade, status, students(id, full_name, matric_number, student_id, department_id, level_id, departments(name), levels(name), profiles(full_name))",
    )
    .eq("exam_id", examId)
    .eq("school_id", schoolId)
    .order("created_at", { ascending: true })
    .limit(2000);

  // Carryover flags for this course
  const courseId = (exam as { course_id?: string | null }).course_id;
  let carryoverStudentIds = new Set<string>();
  if (courseId) {
    try {
      const { data: cos } = await supabase
        .from("course_carryovers")
        .select("student_id")
        .eq("school_id", schoolId)
        .eq("course_id", courseId)
        .eq("status", "active");
      carryoverStudentIds = new Set((cos ?? []).map((c) => String(c.student_id)));
    } catch {
      /* table may not exist yet */
    }
  }

  const rows: ResultStudentRow[] = [];
  let maxScore: number | null = null;

  for (const r of results ?? []) {
    const st = r.students as {
      id?: string;
      full_name?: string | null;
      matric_number?: string | null;
      student_id?: string | null;
      departments?: { name?: string } | { name?: string }[] | null;
      levels?: { name?: string } | { name?: string }[] | null;
      profiles?: { full_name?: string | null } | null;
    } | null;

    const d = one(st?.departments);
    const lv = one(st?.levels);
    const name =
      (st?.full_name || "").trim() ||
      (st?.profiles?.full_name || "").trim() ||
      "Student";
    const matric = st?.matric_number || st?.student_id || "—";
    const score = r.total_score != null ? Number(r.total_score) : null;
    const max = r.max_score != null ? Number(r.max_score) : null;
    if (max != null && (maxScore == null || max > maxScore)) maxScore = max;

    let grade = r.grade;
    if (!grade && assessment !== "test" && r.percentage != null) {
      grade = gradeFromPercentage(Number(r.percentage));
    }

    rows.push({
      resultId: r.id,
      studentId: String(r.student_id),
      fullName: name,
      matric: String(matric),
      departmentName: d?.name || "—",
      levelName: lv?.name || "—",
      score,
      maxScore: max,
      grade: grade || null,
      isCarryover: carryoverStudentIds.has(String(r.student_id)),
      percentage: r.percentage != null ? Number(r.percentage) : null,
    });
  }

  // Sort by name
  rows.sort((a, b) => a.fullName.localeCompare(b.fullName));

  const header: ExamRecordHeader = {
    examId: String((exam as { id: string }).id),
    title: String((exam as { title: string }).title || "Examination"),
    courseCode: courses?.code || "—",
    courseName: courses?.name || "—",
    departmentName: dept?.name || "—",
    levelName: level?.name || "—",
    semesterName: sem?.name || "—",
    sessionName: sess?.name || "—",
    assessment,
    assessmentLabel: assessmentKindLabel(assessment),
    dateLabel,
    maxScore,
    schoolName,
  };

  return { header, rows, assessment };
}

export async function loadFilterOptions(
  schoolId: string | null,
): Promise<{
  sessions: NamedOption[];
  semesters: NamedOption[];
  departments: NamedOption[];
  levels: NamedOption[];
  courses: NamedOption[];
}> {
  if (!schoolId) {
    return { sessions: [], semesters: [], departments: [], levels: [], courses: [] };
  }
  const [sessions, semesters, departments, levels, courses] = await Promise.all([
    supabase.from("academic_sessions").select("id, name").eq("school_id", schoolId).order("name"),
    supabase
      .from("semesters")
      .select("id, name, academic_session_id")
      .eq("school_id", schoolId)
      .order("name"),
    supabase.from("departments").select("id, name").eq("school_id", schoolId).order("name"),
    supabase.from("levels").select("id, name").eq("school_id", schoolId).order("name"),
    supabase.from("courses").select("id, code, name").eq("school_id", schoolId).order("code"),
  ]);
  return {
    sessions: (sessions.data ?? []).map((s) => ({ id: s.id, name: s.name })),
    semesters: (semesters.data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      extra: s.academic_session_id || undefined,
    })),
    departments: (departments.data ?? []).map((d) => ({ id: d.id, name: d.name })),
    levels: (levels.data ?? []).map((l) => ({ id: l.id, name: l.name })),
    courses: (courses.data ?? []).map((c) => ({
      id: c.id,
      name: `${c.code} — ${c.name}`,
      extra: c.code,
    })),
  };
}

export function resultsToCsv(
  header: ExamRecordHeader,
  rows: ResultStudentRow[],
  isTest: boolean,
): string {
  const lines: string[] = [];
  lines.push(`D4EXAM`);
  lines.push(isTest ? `TEST RESULT` : `EXAMINATION RESULT`);
  lines.push(`Course Code,${header.courseCode}`);
  lines.push(`Course,${header.courseName}`);
  lines.push(`Department,${header.departmentName}`);
  lines.push(`Level,${header.levelName}`);
  lines.push(`Semester,${header.semesterName}`);
  lines.push(`Academic Session,${header.sessionName}`);
  lines.push(`Assessment,${header.assessmentLabel}`);
  lines.push(`Date,${header.dateLabel}`);
  lines.push("");
  if (isTest) {
    lines.push(`Student Full Name,Matric Number,Department,Level,Score`);
    for (const r of rows) {
      const sc =
        r.score != null && r.maxScore != null
          ? `${r.score}/${r.maxScore}`
          : r.score != null
            ? String(r.score)
            : "—";
      lines.push(
        `"${r.fullName.replace(/"/g, '""')}",${r.matric},"${r.departmentName.replace(/"/g, '""')}","${r.levelName.replace(/"/g, '""')}",${sc}`,
      );
    }
  } else {
    lines.push(`Student Full Name,Matric Number,Department,Level,Score,Grade`);
    for (const r of rows) {
      const sc =
        r.score != null && r.maxScore != null
          ? `${r.score}/${r.maxScore}`
          : r.score != null
            ? String(r.score)
            : "—";
      lines.push(
        `"${r.fullName.replace(/"/g, '""')}",${r.matric},"${r.departmentName.replace(/"/g, '""')}","${r.levelName.replace(/"/g, '""')}",${sc},${r.grade || "—"}`,
      );
    }
  }
  return lines.join("\n");
}
