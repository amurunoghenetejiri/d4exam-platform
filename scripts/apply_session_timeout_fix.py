#!/usr/bin/env python3
"""Prevent endless loading when profiles RLS hangs. Prefer session RPC + timeouts."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SESSION = ROOT / "src/lib/session.ts"
INDEX = ROOT / "src/routes/index.tsx"

session = SESSION.read_text()
index = INDEX.read_text()

old_index = """  beforeLoad: async () => {
    const user = await fetchSessionUser();
    if (user?.role) {
      throw redirect({ to: roleHome[user.role] as never });
    }
  },"""

new_index = """  beforeLoad: async () => {
    // Hard timeout so a stuck profiles/RLS query cannot freeze the whole site
    let user: Awaited<ReturnType<typeof fetchSessionUser>> = null;
    try {
      user = await Promise.race([
        fetchSessionUser(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2_500)),
      ]);
    } catch {
      user = null;
    }
    if (user?.role) {
      throw redirect({ to: roleHome[user.role] as never });
    }
  },"""

if old_index in index:
    index = index.replace(old_index, new_index, 1)
    print("OK: index beforeLoad timeout")
else:
    print("FAIL: index beforeLoad")

old_block = """  let rpcCtx: SessionContextRpc | null = null;
  try {
    const { data } = await supabase.rpc("get_my_session_context" as never);
    if (data && typeof data === "object") rpcCtx = data as SessionContextRpc;
  } catch {
    /* RPC may not exist yet */
  }

  const [profileByAuth, profileById, roleRes] = await Promise.all([
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
  ]);"""

new_block = """  let rpcCtx: SessionContextRpc | null = null;
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

if old_block in session:
    session = session.replace(old_block, new_block, 1)
    print("OK: session profiles timeout")
else:
    print("FAIL: session block")

old_profile_line = "  const profile = profileByAuth.data ?? profileById.data ?? null;"
new_profile_line = """  let profile = profileByAuth.data ?? profileById.data ?? null;
  if (!profile && rpcCtx?.profile_id) {
    profile = {
      id: rpcCtx.profile_id,
      full_name: rpcCtx.full_name ?? null,
      first_name: null,
      last_name: null,
      email: rpcCtx.email ?? user.email ?? null,
      status: rpcCtx.status ?? "active",
      school_id: rpcCtx.school_id ?? null,
      auth_user_id: user.id,
    } as never;
  }"""

if old_profile_line in session:
    session = session.replace(old_profile_line, new_profile_line, 1)
    print("OK: rpcCtx profile fallback")
else:
    print("FAIL: profile line")

session = session.replace(
    'const u = await withTimeout(fetchSessionUser(), 6_000, "session");',
    'const u = await withTimeout(fetchSessionUser(), 5_000, "session");',
)
session = session.replace(
    """    retry: 2,
    retryDelay: 800,""",
    """    retry: 1,
    retryDelay: 400,""",
)

SESSION.write_text(session)
INDEX.write_text(index)
print("DONE")
