import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { StudentContext, StudentCourse } from "@/lib/student";

/**
 * Server-side student context.
 * Prefers service-role admin client; falls back to the authenticated user client
 * so student dashboards still work when SUPABASE_SERVICE_ROLE_KEY is not set.
 */
export const getMyStudentContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StudentContext | null> => {
    const userId = context.userId as string;

    type Db = typeof context.supabase;
    let db: Db = context.supabase;
    try {
      const mod = await import("@/integrations/supabase/client.server");
      if (mod.supabaseAdmin) db = mod.supabaseAdmin as unknown as Db;
    } catch (e) {
      console.warn("[student-context] admin client unavailable, using user client", e);
    }

    const { data: profileByAuth } = await db
      .from("profiles")
      .select("id, full_name, email, status, school_id")
      .eq("auth_user_id", userId)
      .maybeSingle();
    let profile = profileByAuth;
    if (!profile?.id) {
      const { data: profileById } = await db
        .from("profiles")
        .select("id, full_name, email, status, school_id")
        .eq("id", userId)
        .maybeSingle();
      profile = profileById;
    }

    if (!profile?.id || !profile.school_id) return null;

    const schoolId = profile.school_id as string;
    const profileId = profile.id as string;

    const studentSelect =
      "id, matric_number, student_id, school_id, profile_id, department_id, level_id, faculty_id, status, departments(name), faculties(name), levels(name)";

    let student: Record<string, unknown> | null = null;

    const { data: byProfile } = await db
      .from("students")
      .select(studentSelect)
      .eq("profile_id", profileId)
      .eq("school_id", schoolId)
      .maybeSingle();
    student = (byProfile as Record<string, unknown> | null) ?? null;

    if (!student && profile.email) {
      const local = String(profile.email).split("@")[0] || "";
      const norm = local.replace(/[^a-z0-9]/gi, "").toLowerCase();
      if (norm.length >= 6) {
        const { data: candidates } = await db
          .from("students")
          .select(studentSelect)
          .eq("school_id", schoolId)
          .limit(5000);
        const rows = (candidates ?? []) as Record<string, unknown>[];
        student =
          rows.find((s) => {
            const m = String(s.matric_number || s.student_id || "")
              .replace(/[^a-z0-9]/gi, "")
              .toLowerCase();
            return m && (m === norm || norm.includes(m) || m.includes(norm));
          }) ?? null;
      }
    }

    if (!student) return null;

    if (!student.profile_id) {
      await db
        .from("students")
        .update({ profile_id: profileId } as never)
        .eq("id", student.id as string)
        .eq("school_id", schoolId);
      student.profile_id = profileId;
    }

    const { data: sessions } = await db
      .from("academic_sessions")
      .select("id, name, status")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false })
      .limit(20);
    const activeSession =
      (sessions ?? []).find((s) => String(s.status).toLowerCase() === "active") ??
      (sessions ?? [])[0] ??
      null;

    let semesterName: string | null = null;
    let semesterId: string | null = null;
    if (activeSession?.id) {
      const { data: semesters } = await db
        .from("semesters")
        .select("id, name, status")
        .eq("school_id", schoolId)
        .eq("academic_session_id", activeSession.id)
        .order("created_at", { ascending: false })
        .limit(10);
      const activeSem =
        (semesters ?? []).find((s) => String(s.status).toLowerCase() === "active") ??
        (semesters ?? [])[0] ??
        null;
      semesterName = (activeSem?.name as string | null) ?? null;
      semesterId = (activeSem?.id as string | null) ?? null;
    }

    const { data: links } = await db
      .from("student_courses")
      .select("course_id, semester_id, courses(id, code, name)")
      .eq("student_id", student.id as string)
      .eq("school_id", schoolId);

    const byId = new Map<string, StudentCourse>();
    for (const row of links ?? []) {
      const rowSemester = (row as { semester_id?: string | null }).semester_id ?? null;
      if (semesterId && rowSemester && rowSemester !== semesterId) continue;
      const c = row.courses as { id: string; code: string; name: string } | null | undefined;
      if (c?.id) byId.set(c.id, { id: c.id, code: c.code, name: c.name });
    }

    const departmentId = (student.department_id as string | null) ?? null;
    const levelId = (student.level_id as string | null) ?? null;
    if (departmentId) {
      let oq = db
        .from("course_offerings")
        .select("course_id, courses(id, code, name)")
        .eq("school_id", schoolId)
        .eq("department_id", departmentId);
      if (levelId) oq = oq.eq("level_id", levelId);
      const { data: offerings } = await oq;
      for (const row of offerings ?? []) {
        const c = row.courses as { id: string; code: string; name: string } | null | undefined;
        if (c?.id) byId.set(c.id, { id: c.id, code: c.code, name: c.name });
      }
    }

    const courses = Array.from(byId.values()).sort((a, b) => a.code.localeCompare(b.code));
    const departments = student.departments as { name: string } | null;
    const faculties = student.faculties as { name: string } | null;
    const levels = student.levels as { name: string } | null;
    const status = String((student.status as string | null) ?? "active");

    const { data: school } = await db
      .from("schools")
      .select("name")
      .eq("id", schoolId)
      .maybeSingle();

    return {
      studentId: student.id as string,
      matric:
        (student.matric_number as string | null) ?? (student.student_id as string | null) ?? null,
      schoolId,
      profileId: (student.profile_id as string | null) ?? profileId,
      fullName:
        ((profile.full_name as string | null) || "").trim() ||
        (student.matric_number as string | null) ||
        "",
      email: (profile.email as string | null) || "",
      schoolName: (school?.name as string | null) ?? null,
      departmentId,
      levelId,
      facultyId: (student.faculty_id as string | null) ?? null,
      departmentName: departments?.name ?? null,
      facultyName: faculties?.name ?? null,
      levelName: levels?.name ?? null,
      status,
      isActive: status.toLowerCase() === "active",
      sessionName: (activeSession?.name as string | null) ?? null,
      semesterName,
      semesterId,
      courses,
      courseIds: courses.map((c) => c.id),
    };
  });

/** Reliable school dashboard counts (service role — ignores RLS quirks). */
export const getSchoolDashboardCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ schoolId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const schoolId = data.schoolId;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("school_id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    const { data: isSuper } = await supabaseAdmin.rpc("is_super_admin");
    const allowed =
      isSuper === true ||
      (profile?.school_id && String(profile.school_id) === schoolId);
    if (!allowed) throw new Error("Forbidden");

    const [students, teachers, officers, courses] = await Promise.all([
      supabaseAdmin.from("students").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
      supabaseAdmin.from("teachers").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
      supabaseAdmin.from("examination_officers").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
      supabaseAdmin.from("courses").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
    ]);

    return {
      students: students.count ?? 0,
      teachers: teachers.count ?? 0,
      officers: officers.count ?? 0,
      courses: courses.count ?? 0,
    };
  });
