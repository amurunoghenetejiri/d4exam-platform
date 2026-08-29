export async function switchToAccount(userId: string): Promise<{ ok: true } | { ok: false; error: string; needsLogin?: boolean }> {
  const vault = readVault();
  const account = vault.accounts.find((a) => a.userId === userId);
  if (!account) return { ok: false, error: "Account not found on this device." };
  if (!account.refreshToken) {
    return { ok: false, error: "No saved session for that account. Sign in again.", needsLogin: true };
  }

  const path =
    account.role && account.role in roleHome ? roleHome[account.role] : "/";

  try {
    try {
      const { data: cur } = await supabase.auth.getSession();
      if (cur.session?.user?.id === userId) {
        setActiveAccountId(userId);
        if (account.role) seedPendingLoginRole(account.role);
        if (typeof window !== "undefined") window.location.replace(path);
        return { ok: true };
      }
    } catch {
      /* continue */
    }

    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      /* ignore */
    }

    let access = account.accessToken;
    let refresh = account.refreshToken;

    const { data: setData, error: setErr } = await supabase.auth.setSession({
      access_token: access,
      refresh_token: refresh,
    });

    if (!setErr && setData.session?.access_token && setData.session.refresh_token) {
      access = setData.session.access_token;
      refresh = setData.session.refresh_token;
    } else {
      const { data: refData, error: refErr } = await supabase.auth.refreshSession({
        refresh_token: refresh,
      });
      if (refErr || !refData.session?.access_token || !refData.session.refresh_token) {
        return {
          ok: false,
          error: "Session expired for that account. Sign in again.",
          needsLogin: true,
        };
      }
      access = refData.session.access_token;
      refresh = refData.session.refresh_token;
    }

    account.accessToken = access;
    account.refreshToken = refresh;
    account.lastUsedAt = Date.now();
    const idx = vault.accounts.findIndex((a) => a.userId === userId);
    if (idx >= 0) vault.accounts[idx] = account;
    else vault.accounts.push(account);
    writeVault(vault);
    setActiveAccountId(userId);

    if (account.role) seedPendingLoginRole(account.role);

    if (typeof window !== "undefined") window.location.replace(path);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Could not switch account." };
  }
}

