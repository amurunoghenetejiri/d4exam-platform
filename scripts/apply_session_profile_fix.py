#!/usr/bin/env python3
"""Ensure session always resolves fullName + schoolId from get_my_session_context RPC first."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SESSION = ROOT / "src/lib/session.ts"
s = SESSION.read_text()

old_rpc = """  let rpcCtx: SessionContextRpc | null = null;
  try {
    const data = await withTimeout(
      supabase.rpc("get_my_session_context" as never).then((r) => r.data),
      3_000,
      "get_my_session_context",
    );
    if (data && typeof data === "object") rpcCtx = data as SessionContextRpc;
  } catch {
    /* RPC may not exist yet or timed out */
  }

  let profileByAuth: { data: Record<string, unknown> | null } = { data: null };
  let profileById: { data: Record<string, unknown> | null } = { data: null };
  let roleRes: { data: { role: string; school_id: string | null; user_id: string }[] | null } = { data: null };
  try {
    const triple = await withTimeout(
      Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, first_name, last_name, email, status, school_id, auth_user_id")
          .eq("auth_user_id", user.id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("id, full_name, first_name, last_name, email, status, school_id, auth_user_id")
          .eq("id", user.id)
          .maybeSingle(),
        supabase.from("user_roles").select("role, school_id, user_id").eq("user_id", user.id),
      ]),
      4_000,
      "profiles+roles",
    );
    profileByAuth = triple[0] as typeof profileByAuth;
    profileById = triple[1] as typeof profileById;
    roleRes = triple[2] as typeof roleRes;
  } catch (e) {
    console.warn("[session] profiles/roles timed out or failed", e);
  }"""

new_rpc = """  let rpcCtx: SessionContextRpc | null = null;
  try {
    const data = await withTimeout(
      supabase.rpc("get_my_session_context" as never).then((r) => r.data),
      6_000,
      "get_my_session_context",
    );
    if (data && typeof data === "object") rpcCtx = data as SessionContextRpc;
  } catch {
    /* RPC may not exist yet or timed out */
  }

  let profileByAuth: { data: Record<string, unknown> | null } = { data: null };
  let profileById: { data: Record<string, unknown> | null } = { data: null };
  let roleRes: { data: { role: string; school_id: string | null; user_id: string }[] | null } = { data: null };
  try {
    const triple = await withTimeout(
      Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, first_name, last_name, email, status, school_id, auth_user_id")
          .eq("auth_user_id", user.id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("id, full_name, first_name, last_name, email, status, school_id, auth_user_id")
          .eq("id", user.id)
          .maybeSingle(),
        supabase.from("user_roles").select("role, school_id, user_id").eq("user_id", user.id),
      ]),
      6_000,
      "profiles+roles",
    );
    profileByAuth = triple[0] as typeof profileByAuth;
    profileById = triple[1] as typeof profileById;
    roleRes = triple[2] as typeof roleRes;
  } catch (e) {
    console.warn("[session] profiles/roles timed out or failed", e);
  }

  if (rpcCtx?.profile_id && !(profileByAuth.data || profileById.data)) {
    profileByAuth = {
      data: {
        id: rpcCtx.profile_id,
        full_name: rpcCtx.full_name ?? null,
        first_name: null,
        last_name: null,
        email: rpcCtx.email ?? user.email ?? null,
        status: rpcCtx.status ?? "active",
        school_id: rpcCtx.school_id ?? null,
        auth_user_id: user.id,
      },
    };
  }"""

if old_rpc in s:
    s = s.replace(old_rpc, new_rpc, 1)
    print("OK: rpc-first block")
else:
    print("FAIL: rpc block")

old_school = """  let schoolId: string | null =
    (rpcCtx?.school_id as string | null) ||
    (profile?.school_id as string | null) ||
    (roleRes.data ?? []).map((r) => (r as { school_id?: string | null }).school_id).find(Boolean) ||
    null;"""

new_school = """  let schoolId: string | null =
    (rpcCtx?.school_id ? String(rpcCtx.school_id) : null) ||
    (profile?.school_id ? String(profile.school_id as string) : null) ||
    (roleRes.data ?? []).map((r) => (r as { school_id?: string | null }).school_id).find(Boolean) ||
    null;"""

if old_school in s:
    s = s.replace(old_school, new_school, 1)
    print("OK: schoolId")
else:
    print("FAIL: schoolId")

old_fn = """  const fullName =
    displayNameFromProfile(profile) ||
    (rpcCtx?.full_name || "").trim() ||
    user.email ||
    "";"""

new_fn = """  const fullName =
    displayNameFromProfile(profile as { full_name?: string | null; first_name?: string | null; last_name?: string | null } | null) ||
    (rpcCtx?.full_name || "").trim() ||
    (typeof profile?.full_name === "string" ? profile.full_name.trim() : "") ||
    user.email ||
    "";"""

if old_fn in s:
    s = s.replace(old_fn, new_fn, 1)
    print("OK: fullName")
else:
    print("FAIL: fullName")

s = s.replace(
    'const u = await withTimeout(fetchSessionUser(), 5_000, "session");',
    'const u = await withTimeout(fetchSessionUser(), 12_000, "session");',
)
s = s.replace(
    """          if (u?.userId) {
            rememberLastUserId(u.userId);
            await offlineSet(u.userId, OfflineKeys.sessionUser, u, { schoolId: u.schoolId });
            void mirrorSessionUser(u);
          }
          return u;""",
    """          if (u?.userId) {
            rememberLastUserId(u.userId);
            const needsSchool = u.role && u.role !== "super_admin";
            if (!needsSchool || u.schoolId) {
              await offlineSet(u.userId, OfflineKeys.sessionUser, u, { schoolId: u.schoolId });
              void mirrorSessionUser(u);
            }
          }
          return u;""",
)

s = s.replace(
    """    staleTime: 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    retry: 1,
    retryDelay: 400,""",
    """    staleTime: 15_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    retry: 2,
    retryDelay: 600,""",
)

SESSION.write_text(s)
print("DONE")
