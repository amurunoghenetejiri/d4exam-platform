#!/usr/bin/env python3
from pathlib import Path
import sys

def must(cond, msg):
    if not cond:
        print("FAIL", msg)
        sys.exit(1)

# --- session ---
p = Path("src/lib/session.ts")
t = p.read_text()
if "export function roleFromPath" not in t:
    old = '/** Remember last in-app path so Capacitor relaunch restores role route. */\nexport function rememberLastPath(path: string, role?: string | null): void {\n  if (typeof window === "undefined") return;\n  try {\n    const p = (path || "").split("?")[0];\n    if (!p || p === "/" || p === "/login" || p.startsWith("/auth")) return;\n    window.localStorage.setItem(LAST_PATH_KEY, p);\n    if (role) window.localStorage.setItem(LAST_ROLE_KEY, role);\n  } catch { /* ignore */ }\n}'
    new = '''/** Map an in-app pathname to AppRole when possible. */
export function roleFromPath(path: string | null | undefined): AppRole | null {
  const p = String(path || "").split("?")[0];
  if (p.startsWith("/student")) return "student";
  if (p.startsWith("/teacher")) return "teacher";
  if (p.startsWith("/officer")) return "examination_officer";
  if (p.startsWith("/admin")) return "school_admin";
  if (p.startsWith("/super-admin")) return "super_admin";
  return null;
}

/** Remember last in-app path so Capacitor relaunch restores role route. */
export function rememberLastPath(path: string, role?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const p = (path || "").split("?")[0];
    if (
      !p ||
      p === "/" ||
      p === "/login" ||
      p.startsWith("/auth") ||
      p.startsWith("/about") ||
      p.startsWith("/pricing") ||
      p.startsWith("/privacy") ||
      p.startsWith("/support") ||
      p.startsWith("/features")
    ) {
      return;
    }
    window.localStorage.setItem(LAST_PATH_KEY, p);
    const known = ["student", "teacher", "school_admin", "examination_officer", "super_admin"];
    const fromArg = role && known.includes(String(role)) ? String(role) : null;
    const r = fromArg || roleFromPath(p);
    if (r) {
      window.localStorage.setItem(LAST_ROLE_KEY, r);
      window.localStorage.setItem(PREFERRED_ROLE_KEY, r);
    }
  } catch { /* ignore */ }
}'''
    must(old in t, "rememberLastPath block")
    t = t.replace(old, new)
if "readCachedSchoolBrand" not in t:
    needle = '''const SCHOOL_BRAND_KEY = "d4exam_school_brand_v1";
function seedSchoolBrandFromSession(schoolId?: string | null, name?: string | null, logoUrl?: string | null) {
  if (typeof window === "undefined" || !schoolId) return;
  if (!name && !logoUrl) return;
  try {
    window.localStorage.setItem(SCHOOL_BRAND_KEY, JSON.stringify({ id: schoolId, name: name || null, logoUrl: logoUrl || null, ts: Date.now() }));
  } catch {}
}'''
    must(needle in t, "brand needle")
    t = t.replace(needle, needle + '''

/** Cached school logo/name for offline / exam gate when live query is slow. */
export function readCachedSchoolBrand(schoolId?: string | null): { id?: string; name?: string | null; logoUrl?: string | null } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SCHOOL_BRAND_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string; name?: string | null; logoUrl?: string | null; ts?: number };
    if (schoolId && parsed.id && parsed.id !== schoolId) return null;
    if (parsed.ts && Date.now() - parsed.ts > 30 * 24 * 60 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}''')
p.write_text(t)
print("session", len(t))

# --- index ---
p = Path("src/routes/index.tsx")
t = p.read_text()
if "isRedirect" not in t:
    t = t.replace(
        'import { createFileRoute, Link, redirect } from "@tanstack/react-router";',
        'import { createFileRoute, Link, redirect, isRedirect } from "@tanstack/react-router";',
    )
if "if (isRedirect(e)) throw e;" not in t:
    t = t.replace(
        'if (e && typeof e === "object" && "to" in e) throw e;',
        'if (isRedirect(e)) throw e;\n      if (e && typeof e === "object" && ("to" in e || "isRedirect" in e)) throw e;',
    )
p.write_text(t)
print("index", len(t))

# --- root ---
p = Path("src/routes/__root.tsx")
t = p.read_text()
if "roleFromPath" not in t:
    t = t.replace(
        'import { useSessionUser, rememberLastPath } from "@/lib/session";',
        'import { useSessionUser, rememberLastPath, readLastRole, readPreferredRole, roleHome, roleFromPath, type AppRole } from "@/lib/session";',
    )
old = '''function NativeBootstrap() {
  const { data: session } = useSessionUser();
  const pathForPersist = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    if (session?.role && pathForPersist) {
      rememberLastPath(pathForPersist, session.role);
    }
  }, [pathForPersist, session?.role]);'''
new = '''function NativeBootstrap() {
  const { data: session } = useSessionUser();
  const router = useRouter();
  const pathForPersist = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    if (!pathForPersist) return;
    rememberLastPath(pathForPersist, session?.role ?? roleFromPath(pathForPersist));
  }, [pathForPersist, session?.role]);
  useEffect(() => {
    if (pathForPersist !== "/") return;
    const role = (readLastRole() || readPreferredRole() || session?.role) as AppRole | null;
    if (role && roleHome[role]) {
      void router.navigate({ to: roleHome[role] as never, replace: true });
    }
  }, [pathForPersist, session?.role, router]);'''
if old in t:
    t = t.replace(old, new)
elif "pathForPersist !== \"/\"" not in t:
    print("FAIL root bootstrap")
    sys.exit(1)
p.write_text(t)
print("root", len(t))

# --- cbt logo ---
p = Path("src/components/cbt/CbtExamSession.impl.tsx")
t = p.read_text()
if "readCachedSchoolBrand" not in t:
    t = t.replace(
        'import { useSessionUser } from "@/lib/session";',
        'import { useSessionUser, readCachedSchoolBrand } from "@/lib/session";',
    )
if "resolvedLogoUrl" not in t:
    old = '  const { data: schoolBrand } = useSchoolIdentity(student?.schoolId ?? session?.schoolId);'
    new = '''  const schoolIdForBrand = student?.schoolId ?? session?.schoolId ?? null;
  const { data: schoolBrand } = useSchoolIdentity(schoolIdForBrand);
  const cachedBrand = typeof window !== "undefined" ? readCachedSchoolBrand(schoolIdForBrand) : null;
  const resolvedLogoUrl =
    schoolBrand?.logoUrl ||
    session?.schoolLogoUrl ||
    cachedBrand?.logoUrl ||
    null;
  const resolvedSchoolName =
    schoolBrand?.name ||
    student?.schoolName ||
    session?.schoolName ||
    cachedBrand?.name ||
    null;'''
    must(old in t, "cbt brand")
    t = t.replace(old, new)
    t = t.replace(
        'schoolLogoUrl={schoolBrand?.logoUrl ?? session?.schoolLogoUrl}\n        schoolName={schoolBrand?.name ?? student?.schoolName ?? session?.schoolName}',
        'schoolLogoUrl={resolvedLogoUrl}\n        schoolName={resolvedSchoolName}',
    )
    t = t.replace(
        'logoUrl={schoolBrand?.logoUrl ?? session?.schoolLogoUrl} schoolName={schoolBrand?.name ?? session?.schoolName}',
        'logoUrl={resolvedLogoUrl} schoolName={resolvedSchoolName}',
    )
    t = t.replace(
        'logoUrl={schoolBrand?.logoUrl ?? session?.schoolLogoUrl} schoolName={schoolBrand?.name ?? student?.schoolName ?? session?.schoolName}',
        'logoUrl={resolvedLogoUrl} schoolName={resolvedSchoolName}',
    )
p.write_text(t)
print("cbt", len(t))

# --- SchoolLogo ---
p = Path("src/components/brand/SchoolLogo.tsx")
t = p.read_text()
t2 = t.replace(
    'const showFallback = !logoUrl || failed;',
    'const showFallback = !(logoUrl && String(logoUrl).trim()) || failed;',
)
if 'referrerPolicy="no-referrer"' not in t2:
    t2 = t2.replace(
        'fetchPriority={priority ? "high" : undefined}\n      onError={() => setFailed(true)}',
        'fetchPriority={priority ? "high" : undefined}\n      referrerPolicy="no-referrer"\n      onError={() => setFailed(true)}',
    )
p.write_text(t2)
print("logo", len(t2))

# --- gate priority ---
p = Path("src/components/cbt/ExamSecurityGate.tsx")
t = p.read_text()
if 'priority\n            size="xl"' not in t:
    t = t.replace(
        'logoUrl={schoolLogoUrl}\n            schoolName={schoolName}\n            size="xl"',
        'logoUrl={schoolLogoUrl}\n            schoolName={schoolName}\n            priority\n            size="xl"',
    )
p.write_text(t)
print("gate", len(t))

Path("FORCE_DEPLOY.txt").write_text("cold-start-logo 2026-09-10\n")
print("OK")
