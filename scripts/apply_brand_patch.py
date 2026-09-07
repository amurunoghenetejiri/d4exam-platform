#!/usr/bin/env python3
from pathlib import Path
import re

def main() -> None:
    app_path = Path("src/components/layout/AppShell.tsx")
    app = app_path.read_text()
    app = re.sub(
        r"function readSeededSchoolBrand\(schoolId\?: string \| null\): \{ name: string \| null; logoUrl: string \| null \} \{[\s\S]*?return \{ name: null, logoUrl: null \};\n\}",
        '''function readSeededSchoolBrand(schoolId?: string | null): { name: string | null; logoUrl: string | null } {
  if (typeof window === "undefined") return { name: null, logoUrl: null };
  try {
    const raw = window.localStorage.getItem(SCHOOL_BRAND_KEY);
    if (!raw) return { name: null, logoUrl: null };
    const parsed = JSON.parse(raw) as { id?: string; name?: string | null; logoUrl?: string | null };
    if (schoolId && parsed?.id && String(parsed.id) !== String(schoolId)) {
      return { name: null, logoUrl: null };
    }
    return { name: parsed.name ?? null, logoUrl: parsed.logoUrl ?? null };
  } catch { /* ignore */ }
  return { name: null, logoUrl: null };
}''',
        app,
        count=1,
    )
    old_logic = """  const isSuperAdmin = session?.role === \"super_admin\";\n  const isSchoolPortal = Boolean(session?.schoolId) && !isSuperAdmin;\n  const seeded = isSchoolPortal ? readSeededSchoolBrand(session?.schoolId) : { name: null, logoUrl: null };\n  const logoUrl = isSuperAdmin ? null : (school?.logoUrl ?? session?.schoolLogoUrl ?? seeded.logoUrl ?? null);\n  const schoolName = isSuperAdmin ? null : (school?.name ?? session?.schoolName ?? seeded.name ?? null);\n  if (isSchoolPortal && session?.schoolId && (schoolName || logoUrl)) {\n    seedSchoolBrand(session.schoolId, schoolName, logoUrl);\n  }""".replace("\\n", "\n").replace('\\"', '"')
    new_logic = """  const isSuperAdmin = session?.role === \"super_admin\" || (session?.roles ?? []).includes(\"super_admin\");\n  const pathIsSchoolPortal =\n    pathname.startsWith(\"/student\") ||\n    pathname.startsWith(\"/teacher\") ||\n    pathname.startsWith(\"/officer\") ||\n    pathname.startsWith(\"/admin\");\n  const isSchoolPortal = !isSuperAdmin && (Boolean(session?.schoolId) || pathIsSchoolPortal);\n  const seeded = isSchoolPortal && !isSuperAdmin ? readSeededSchoolBrand(session?.schoolId) : { name: null, logoUrl: null };\n  const logoUrl = isSuperAdmin ? null : (school?.logoUrl ?? session?.schoolLogoUrl ?? seeded.logoUrl ?? null);\n  const schoolName = isSuperAdmin ? null : (school?.name ?? session?.schoolName ?? seeded.name ?? null);\n  if (!isSuperAdmin && session?.schoolId && (schoolName || logoUrl)) {\n    seedSchoolBrand(session.schoolId, schoolName, logoUrl);\n  }""".replace("\\n", "\n").replace('\\"', '"')
    if old_logic in app:
        app = app.replace(old_logic, new_logic)
        print("AppShell logic patched")
    else:
        print("WARN: AppShell logic block not found")
        open("/tmp/appshell_snip.txt","w").write(app[app.find("isSuperAdmin"):app.find("isSuperAdmin")+500] if "isSuperAdmin" in app else "missing")
    app = app.replace('size="md"\n          className="shrink-0 bg-transparent"\n        />', 'size="md"\n          className="shrink-0 bg-transparent"\n          priority\n        />')
    app = app.replace('size="sm"\n                    className="shrink-0 bg-transparent"\n                  />', 'size="sm"\n                    className="shrink-0 bg-transparent"\n                    priority\n                  />')
    app_path.write_text(app)
    print("AppShell written", len(app), "priority", app.count("priority"))

    st_path = Path("src/lib/student.ts")
    st = st_path.read_text()
    st2, n = re.subn(
        r"\n\s*if \(!courses\.length && schoolId && departmentId && levelId\) \{[\s\S]*?\n\s*\}",
        "\n            // Students self-enrol from Courses page.\n",
        st,
        count=1,
    )
    if n == 0:
        st2, n = re.subn(
            r"\n\s*// Only auto-map courses[\s\S]*?\n\s*\}",
            "\n            // Students self-enrol from Courses page.\n",
            st,
            count=1,
        )
    st_path.write_text(st2)
    print("student.ts", n, len(st2))

    se_path = Path("src/lib/session.ts")
    se = se_path.read_text()
    if "seedSchoolBrandFromSession" not in se:
        helper = '''\nconst SCHOOL_BRAND_KEY = "d4exam_school_brand_v1";\nfunction seedSchoolBrandFromSession(schoolId?: string | null, name?: string | null, logoUrl?: string | null) {\n  if (typeof window === "undefined" || !schoolId) return;\n  if (!name && !logoUrl) return;\n  try {\n    window.localStorage.setItem(SCHOOL_BRAND_KEY, JSON.stringify({ id: schoolId, name: name || null, logoUrl: logoUrl || null, ts: Date.now() }));\n  } catch {}\n}\n'''
        m = re.search(r"export const roleHome: Record<AppRole, string> = \{[\s\S]*?\};\n", se)
        if m:
            se = se[: m.end()] + helper + se[m.end() :]
            print("inserted session helper")
    se, nf = re.subn(
        r"(    clearPendingLoginRole\(\);\n)(    return \{\n      userId: user\.id,)",
        r"\1    seedSchoolBrandFromSession(schoolId, schoolName, schoolLogoUrl);\n\2",
        se,
        count=1,
    )
    print("fast path seed", nf)
    if se.count("seedSchoolBrandFromSession(schoolId, schoolName, schoolLogoUrl)") < 2:
        idx = se.rfind("  return {\n    userId: user.id,")
        if idx > 0:
            se = se[:idx] + "  seedSchoolBrandFromSession(schoolId, schoolName, schoolLogoUrl);\n" + se[idx:]
            print("seeded slow path")
    se_path.write_text(se)
    print("session.ts written", len(se))
    for p in ["src/components/layout/AppShell.tsx", "src/lib/student.ts", "src/lib/session.ts"]:
        if "PLACEHOLDER" in Path(p).read_text():
            raise SystemExit(f"ERROR PLACEHOLDER in {p}")

if __name__ == "__main__":
    main()
