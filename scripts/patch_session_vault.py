from pathlib import Path
sess = Path("src/lib/session.ts")
stext = sess.read_text()
if "TOKEN_REFRESHED" in stext and "touchActiveAccountTokens" in stext:
    print("already")
else:
    old = """    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        void queryClient.invalidateQueries({ queryKey: ["session-user"] });
      }
    });"""
    new = """    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED") {
        void queryClient.invalidateQueries({ queryKey: ["session-user"] });
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        void import("@/lib/account-switcher")
          .then((m) => m.touchActiveAccountTokens?.() ?? m.saveCurrentAccountToVault?.())
          .catch(() => {});
      }
    });"""
    if old in stext:
        sess.write_text(stext.replace(old, new, 1))
        print("session vault refresh")
    else:
        print("session MISSING")

acc = Path("src/lib/account-switcher.ts")
at = acc.read_text()
old_read = '    return { accounts: parsed.accounts.filter((a) => a && a.userId && a.refreshToken) };'
new_read = '    return { accounts: parsed.accounts.filter((a) => a && a.userId) };'
if old_read in at:
    acc.write_text(at.replace(old_read, new_read, 1))
    print("vault list")
elif new_read in at:
    print("vault already")
else:
    print("vault MISSING")
