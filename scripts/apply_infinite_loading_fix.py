#!/usr/bin/env python3
"""Fix infinite/slow loading and missing profiles: never cache incomplete sessions."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GUARD = ROOT / "src/lib/guard.ts"
SESSION = ROOT / "src/lib/session.ts"

g = GUARD.read_text()

old_cache_check = """  let user: SessionUser | null | undefined;
  if (queryClient) {
    user = queryClient.getQueryData<SessionUser | null>(["session-user"]);
  }

  // Never trust a cached null right after login — always re-resolve when missing.
  // Also re-resolve when we only have a cached null but an auth session exists.
  let hasAuthSession = false;
  try {
    const { data: sess } = await supabase.auth.getSession();
    hasAuthSession = Boolean(sess.session?.access_token && sess.session.user?.id);
  } catch {
    hasAuthSession = false;
  }

  if (user === undefined || (user === null && hasAuthSession)) {
    try {
      user = await Promise.race([
        fetchSessionUser(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 4_000)),
      ]);
    } catch {
      user = null;
    }
    // Retry if auth session exists but profile/roles were slow
    if (!user && hasAuthSession) {
      try {
        await new Promise((r) => setTimeout(r, 500));
        user = await Promise.race([
          fetchSessionUser(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3_000)),
        ]);
      } catch {
        /* ignore */
      }
    }
    if (!user) {
      try {
        const last = readLastUserId();
        if (last) {
          const env = await offlineGet<SessionUser>(last, OfflineKeys.sessionUser);
          if (env?.data) user = env.data;
        }
      } catch {
        /* ignore */
      }
    }
    if (queryClient && user) {
      queryClient.setQueryData(["session-user"], user);
    }
  }"""

new_cache_check = """  let user: SessionUser | null | undefined;
  if (queryClient) {
    user = queryClient.getQueryData<SessionUser | null>(["session-user"]);
  }

  let hasAuthSession = false;
  try {
    const { data: sess } = await supabase.auth.getSession();
    hasAuthSession = Boolean(sess.session?.access_token && sess.session.user?.id);
  } catch {
    hasAuthSession = false;
  }

  // Incomplete = school-bound role with no schoolId. NEVER trust that cache.
  const needsSchool = (u: SessionUser | null | undefined) =>
    Boolean(u?.role && u.role !== "super_admin" && !u.schoolId);
  const isIncomplete = (u: SessionUser | null | undefined) =>
    Boolean(u && (needsSchool(u) || (!u.fullName && !u.email)));

  const mustResolve =
    user === undefined ||
    (user === null && hasAuthSession) ||
    (hasAuthSession && isIncomplete(user));

  if (mustResolve) {
    try {
      user = await Promise.race([
        fetchSessionUser(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000)),
      ]);
    } catch {
      user = null;
    }
    if ((!user || isIncomplete(user)) && hasAuthSession) {
      try {
        await new Promise((r) => setTimeout(r, 400));
        const again = await Promise.race([
          fetchSessionUser(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 4_000)),
        ]);
        if (again && (!user || !isIncomplete(again))) user = again;
        else if (again && isIncomplete(user) && !isIncomplete(again)) user = again;
        else if (again && !user) user = again;
      } catch {
        /* ignore */
      }
    }
    if (!user || isIncomplete(user)) {
      try {
        const last = readLastUserId();
        if (last) {
          const env = await offlineGet<SessionUser>(last, OfflineKeys.sessionUser);
          if (env?.data && !isIncomplete(env.data)) user = env.data;
        }
      } catch {
        /* ignore */
      }
    }
    if (queryClient && user && !isIncomplete(user)) {
      queryClient.setQueryData(["session-user"], user);
    }
  }"""

if old_cache_check in g:
    g = g.replace(old_cache_check, new_cache_check, 1)
    print("OK: guard resolve")
else:
    print("FAIL: guard resolve block")

old_minimal = """      if (sess.session?.user && pending && allowed.includes(pending)) {
        const minimal: SessionUser = {
          userId: sess.session.user.id,
          profileId: sess.session.user.id,
          email: sess.session.user.email || "",
          fullName: sess.session.user.email || "User",
          status: "active",
          schoolId: null,
          schoolName: null,
          schoolCode: null,
          schoolLogoUrl: null,
          roles: [pending],
          role: pending,
          identifier: sess.session.user.email || null,
          identifierLabel: "Email",
        };
        if (queryClient) queryClient.setQueryData(["session-user"], minimal);
        // Keep pending role longer so nested navigations still pass
        window.setTimeout(() => clearPendingLoginRole(), 60_000);
        return { user: minimal };
      }"""

new_minimal = """      if (sess.session?.user && pending && allowed.includes(pending)) {
        try {
          const hard = await Promise.race([
            fetchSessionUser(),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 3_500)),
          ]);
          if (hard && (hard.role === "super_admin" || hard.schoolId)) {
            if (queryClient) queryClient.setQueryData(["session-user"], hard);
            clearPendingLoginRole();
            return { user: hard };
          }
        } catch {
          /* continue to minimal */
        }
        const minimal: SessionUser = {
          userId: sess.session.user.id,
          profileId: sess.session.user.id,
          email: sess.session.user.email || "",
          fullName: sess.session.user.email || "User",
          status: "active",
          schoolId: null,
          schoolName: null,
          schoolCode: null,
          schoolLogoUrl: null,
          roles: [pending],
          role: pending,
          identifier: sess.session.user.email || null,
          identifierLabel: "Email",
        };
        // Do NOT cache incomplete session — next navigation must re-resolve
        window.setTimeout(() => clearPendingLoginRole(), 60_000);
        return { user: minimal };
      }"""

if old_minimal in g:
    g = g.replace(old_minimal, new_minimal, 1)
    print("OK: minimal no-cache")
else:
    print("FAIL: minimal block")

GUARD.write_text(g)
print("guard braces", g.count("{") - g.count("}"))

s = SESSION.read_text()

marker = """  let schoolId: string | null =
    (rpcCtx?.school_id ? String(rpcCtx.school_id) : null) ||
    (profile?.school_id ? String(profile.school_id as string) : null) ||
    (roleRes.data ?? []).map((r) => (r as { school_id?: string | null }).school_id).find(Boolean) ||
    null;

  if (!schoolId && profile?.id) {"""

early = """  let schoolId: string | null =
    (rpcCtx?.school_id ? String(rpcCtx.school_id) : null) ||
    (profile?.school_id ? String(profile.school_id as string) : null) ||
    (roleRes.data ?? []).map((r) => (r as { school_id?: string | null }).school_id).find(Boolean) ||
    null;

  // FAST EXIT: RPC already resolved identity — only load school branding
  if (roles.length > 0 && (schoolId || roles.includes("super_admin"))) {
    let schoolName: string | null = null;
    let schoolCode: string | null = null;
    let schoolLogoUrl: string | null = null;
    if (schoolId) {
      try {
        const { data: school } = await withTimeout(
          supabase.from("schools").select("name, school_code, logo_url").eq("id", schoolId).maybeSingle().then((r) => r),
          2_000,
          "school",
        );
        schoolName = school?.name ?? null;
        schoolCode = school?.school_code ?? null;
        schoolLogoUrl = (school?.logo_url as string | null) ?? null;
      } catch {
        /* non-fatal */
      }
    }
    const priorityFast: AppRole[] = [
      "super_admin",
      "school_admin",
      "examination_officer",
      "teacher",
      "student",
    ];
    const primaryRoleFast = priorityFast.find((r) => roles.includes(r)) ?? null;
    let statusFast = (profile?.status as string | undefined) ?? (rpcCtx?.status as string | undefined) ?? "active";
    if (primaryRoleFast && (statusFast === "pending" || statusFast === "invited")) statusFast = "active";
    const fullNameFast =
      displayNameFromProfile(profile as { full_name?: string | null; first_name?: string | null; last_name?: string | null } | null) ||
      (rpcCtx?.full_name || "").trim() ||
      (typeof profile?.full_name === "string" ? profile.full_name.trim() : "") ||
      user.email ||
      "";
    clearPendingLoginRole();
    return {
      userId: user.id,
      profileId: (rpcCtx?.profile_id as string | undefined) || profile?.id || user.id,
      email: (profile?.email as string | undefined) ?? rpcCtx?.email ?? user.email ?? "",
      fullName: fullNameFast,
      status: statusFast,
      schoolId,
      schoolName,
      schoolCode,
      schoolLogoUrl,
      roles,
      role: primaryRoleFast,
      identifier: rpcCtx?.officer_id || rpcCtx?.staff_id || rpcCtx?.matric || (profile?.email as string | undefined) || user.email || null,
      identifierLabel: rpcCtx?.officer_id ? "Officer ID" : rpcCtx?.staff_id ? "Staff ID" : rpcCtx?.matric ? "Matric" : "Email",
    };
  }

  if (!schoolId && profile?.id) {"""

if marker in s:
    s = s.replace(marker, early, 1)
    print("OK: session fast exit")
else:
    print("FAIL: session marker")

old_uq = """          const u = await withTimeout(fetchSessionUser(), 5000, "session");
          if (u?.userId) {
            rememberLastUserId(u.userId);
            const needsSchool = u.role && u.role !== "super_admin";
            if (!needsSchool || u.schoolId) {
              await offlineSet(u.userId, OfflineKeys.sessionUser, u, { schoolId: u.schoolId });
              void mirrorSessionUser(u);
            }
          }
          return u;"""

new_uq = """          const u = await withTimeout(fetchSessionUser(), 6000, "session");
          if (u?.userId) {
            rememberLastUserId(u.userId);
            const complete = u.role === "super_admin" || Boolean(u.schoolId);
            if (complete) {
              await offlineSet(u.userId, OfflineKeys.sessionUser, u, { schoolId: u.schoolId });
              void mirrorSessionUser(u);
            }
          }
          return u;"""

if old_uq in s:
    s = s.replace(old_uq, new_uq, 1)
    print("OK: useSessionUser")
else:
    print("FAIL: useSessionUser")

SESSION.write_text(s)
print("session braces", s.count("{") - s.count("}"))
print("DONE")
