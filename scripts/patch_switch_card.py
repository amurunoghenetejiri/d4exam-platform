from pathlib import Path
card = Path("src/components/settings/SwitchAccountCard.tsx")
ct = card.read_text()
old = """  async function onSwitch(userId: string) {
    if (userId === session?.userId) {
      toast.message("Already signed in as this account.");
      return;
    }
    setBusyId(userId);
    try {
      const result = await switchToAccount(userId);
      if (!result.ok) {
        if (result.needsLogin) {
          toast.error("Session expired for that account. Sign in again to switch.");
          refresh();
        } else {
          toast.error(result.error);
        }
      }
    } catch (e) {
      toast.error((e as Error).message || "Could not switch account.");
    } finally {
      setBusyId(null);
    }
  }"""
new = """  async function onSwitch(userId: string) {
    if (userId === session?.userId) {
      toast.message("Already signed in as this account.");
      return;
    }
    setBusyId(userId);
    try {
      if (session?.userId) {
        try {
          await saveCurrentAccountToVault(session);
        } catch {
          /* ignore */
        }
      }
      const result = await switchToAccount(userId);
      if (!result.ok) {
        if (result.needsLogin) {
          toast.error(
            "That account needs a fresh sign-in on this device. Use Add Account and sign in once, then switch will work.",
          );
          refresh();
        } else {
          toast.error(result.error);
        }
      }
    } catch (e) {
      toast.error((e as Error).message || "Could not switch account.");
    } finally {
      setBusyId(null);
    }
  }"""
if old in ct:
    card.write_text(ct.replace(old, new, 1))
    print("card patched")
elif "fresh sign-in on this device" in ct:
    print("card already")
else:
    # try older message
    old2 = old.replace("Sign in again to switch.", "Sign in again.")
    if old2 in ct:
        card.write_text(ct.replace(old2, new, 1))
        print("card patched old msg")
    else:
        print("card MISSING")
