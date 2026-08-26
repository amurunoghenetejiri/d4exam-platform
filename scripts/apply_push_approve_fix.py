#!/usr/bin/env python3
from pathlib import Path
import re

def main():
    p = Path("src/lib/notify.ts")
    t = p.read_text()

    # 1) firePush: await dispatch so push actually completes
    if "async function firePush" not in t:
        old = """function firePush(recipientUserId: string, title: string, message: string, link: string | null) {
  void import("@/lib/push-send.functions")
    .then((m) =>
      m.dispatchPushToUser({
        data: {
          recipientUserId,
          title,
          message,
          link: link || "/",
        },
      }),
    )
    .catch(() => undefined);
}"""
        new = """async function firePush(
  recipientUserId: string,
  title: string,
  message: string,
  link: string | null,
): Promise<void> {
  if (!recipientUserId) return;
  try {
    const m = await import("@/lib/push-send.functions");
    const result = await m.dispatchPushToUser({
      data: {
        recipientUserId,
        title,
        message,
        link: link || "/",
      },
    });
    const r = result as { sent?: number; skipped?: boolean; reason?: string };
    if (r?.skipped || (r?.sent ?? 0) === 0) {
      console.warn("[notify] push not delivered", recipientUserId, r?.reason || r);
    }
  } catch (e) {
    console.warn("[notify] firePush failed", e);
  }
}"""
        if old not in t:
            raise SystemExit("firePush block not found")
        t = t.replace(old, new, 1)
        t = t.replace(
            "firePush(p.recipientUserId, p.title, p.message, p.link ?? null);",
            "await firePush(p.recipientUserId, p.title, p.message, p.link ?? null);",
        )
        print("firePush fixed")
    else:
        print("firePush already async")

    # 2) courseStudentAuthIds uses student_courses (real enrollment table)
    if 'from("student_courses")' not in t:
        m = re.search(r"async function courseStudentAuthIds\([\s\S]*?\n\}\n\nexport async function ", t)
        if not m:
            raise SystemExit("courseStudentAuthIds not found")
        body = """async function courseStudentAuthIds(courseId: string | null | undefined, schoolId: string): Promise<string[]> {
  try {
    if (courseId) {
      const sids: string[] = [];
      const { data: sc } = await supabase
        .from("student_courses")
        .select("student_id")
        .eq("course_id", courseId)
        .eq("school_id", schoolId)
        .limit(3000);
      for (const r of sc ?? []) {
        const id = (r as { student_id?: string }).student_id;
        if (id) sids.push(id);
      }
      if (!sids.length) {
        const { data: enroll } = await supabase
          .from("course_enrollments")
          .select("student_id")
          .eq("course_id", courseId)
          .limit(3000);
        for (const r of enroll ?? []) {
          const id = (r as { student_id?: string }).student_id;
          if (id) sids.push(id);
        }
      }
      if (sids.length) return studentIdsToAuthUserIds([...new Set(sids)]);
    }
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("school_id", schoolId)
      .eq("role", "student")
      .limit(3000);
    const fromRoles = [...new Set((roles ?? []).map((r) => (r as { user_id: string }).user_id).filter(Boolean))];
    if (fromRoles.length) return fromRoles;
    const { data: students } = await supabase
      .from("students")
      .select("id, profiles(auth_user_id)")
      .eq("school_id", schoolId)
      .limit(3000);
    const auth: string[] = [];
    for (const s of students ?? []) {
      const aid = (s as { profiles?: { auth_user_id?: string | null } | null }).profiles?.auth_user_id;
      if (aid) auth.push(aid);
    }
    if (auth.length) return [...new Set(auth)];
    return studentIdsToAuthUserIds((students ?? []).map((s) => (s as { id: string }).id).filter(Boolean));
  } catch (e) {
    console.warn("[notify] courseStudentAuthIds failed", e);
    return [];
  }
}

export async function """
        t = t[:m.start()] + body + t[m.end():]
        print("courseStudentAuthIds fixed")
    else:
        print("student_courses already present")

    # 3) studentIdsToAuthUserIds via profiles join
    if "profiles(auth_user_id)" not in t[t.find("studentIdsToAuthUserIds"):t.find("studentIdsToAuthUserIds")+400]:
        m = re.search(
            r"export async function studentIdsToAuthUserIds\([\s\S]*?\n\}\n\nasync function resolveStudentAuthIds",
            t,
        )
        if m:
            body = """export async function studentIdsToAuthUserIds(studentIds: string[]): Promise<string[]> {
  if (!studentIds.length) return [];
  try {
    const { data: students, error } = await supabase
      .from("students")
      .select("id, profile_id, profiles(auth_user_id)")
      .in("id", studentIds);
    if (!error && students?.length) {
      const auth = [
        ...new Set(
          (students as { profiles?: { auth_user_id?: string | null } | null }[])
            .map((s) => s.profiles?.auth_user_id)
            .filter((x): x is string => Boolean(x)),
        ),
      ];
      if (auth.length) return auth;
    }
    return resolveAuthUserIds(studentIds);
  } catch {
    return resolveAuthUserIds(studentIds);
  }
}

async function resolveStudentAuthIds"""
            t = t[:m.start()] + body + t[m.end():]
            print("studentIdsToAuthUserIds fixed")

    p.write_text(t)

    ap = Path("src/routes/officer.approvals.tsx")
    at = ap.read_text()
    if "void notifyStudentsExamApproved" in at:
        at = at.replace("void notifyStudentsExamApproved", "await notifyStudentsExamApproved", 1)
        ap.write_text(at)
        print("approvals await")
    print("ALL OK")

if __name__ == "__main__":
    main()
