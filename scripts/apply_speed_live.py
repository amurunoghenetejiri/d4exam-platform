#!/usr/bin/env python3
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
SESSION = ROOT / "src/lib/session.ts"
s = SESSION.read_text()

# Lower timeouts
s = s.replace("6_000,\n      \"get_my_session_context\"", "2500,\n      \"get_my_session_context\"")
s = s.replace("6_000,\n      \"profiles+roles\"", "2500,\n      \"profiles+roles\"")
s = s.replace("4_000,\n      \"profiles+roles\"", "2500,\n      \"profiles+roles\"")
s = s.replace("3_000,\n      \"get_my_session_context\"", "2500,\n      \"get_my_session_context\"")
s = s.replace("withTimeout(fetchSessionUser(), 12_000", "withTimeout(fetchSessionUser(), 5000")
s = s.replace("withTimeout(fetchSessionUser(), 5_000", "withTimeout(fetchSessionUser(), 5000")

old = """  let rpcCtx: SessionContextRpc | null = null;
  try {
    const data = await withTimeout(
      supabase.rpc("get_my_session_context" as never).then((r) => r.data),
      2500,
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
      2500,
      "profiles+roles",
    );
    profileByAuth = triple[0] as typeof profileByAuth;
    profileById = triple[1] as typeof profileById;
    roleRes = triple[2] as typeof roleRes;
  } catch (e) {
    console.warn("[session] profiles/roles timed out or failed", e);
  }"""

new = """  // FAST: RPC + profiles/roles in parallel (~2.5s max)
  let rpcCtx: SessionContextRpc | null = null;
  let profileByAuth: { data: Record<string, unknown> | null } = { data: null };
  let profileById: { data: Record<string, unknown> | null } = { data: null };
  let roleRes: { data: { role: string; school_id: string | null; user_id: string }[] | null } = { data: null };
  try {
    const [rpcData, triple] = await Promise.all([
      withTimeout(
        supabase.rpc("get_my_session_context" as never).then((r) => r.data),
        2500,
        "get_my_session_context",
      ).catch(() => null),
      withTimeout(
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
        2500,
        "profiles+roles",
      ).catch(() => null),
    ]);
    if (rpcData && typeof rpcData === "object") rpcCtx = rpcData as SessionContextRpc;
    if (triple) {
      profileByAuth = triple[0] as typeof profileByAuth;
      profileById = triple[1] as typeof profileById;
      roleRes = triple[2] as typeof roleRes;
    }
  } catch (e) {
    console.warn("[session] parallel resolve failed", e);
  }"""

if old in s:
    s = s.replace(old, new, 1)
    print("OK parallel")
else:
    print("MISS parallel")

SESSION.write_text(s)
print("session braces", s.count("{") - s.count("}"))

for rel in ["src/routes/officer.index.tsx", "src/routes/officer.live-monitor.tsx"]:
    p = ROOT / rel
    t = p.read_text()
    t = t.replace('.in("status", ["in_progress", "paused", "held", "active"])', '.in("status", ["in_progress"])')
    t = t.replace('.in("status", ["in_progress", "held", "active"])', '.in("status", ["in_progress"])')
    p.write_text(t)
    print("status", rel)

st = ROOT / "src/routes/student.index.tsx"
t = st.read_text()
if ".limit(20);" in t:
    st.write_text(t.replace(".limit(20);", ".limit(100);", 1))
    print("student limit")

ap = ROOT / "src/routes/officer.approvals.tsx"
t = ap.read_text()
ap.write_text(t.replace("staleTime: 10_000,\n    refetchInterval: 30_000,", "staleTime: 3_000,\n    refetchInterval: 8_000,"))
print("DONE")
