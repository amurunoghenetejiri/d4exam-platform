from pathlib import Path
card = Path("src/components/settings/SwitchAccountCard.tsx")
ct = card.read_text()
old = """      const result = await switchToAccount(userId);
      if (!result.ok) {
        if (result.needsLogin) {
          toast.error("Session expired for that account. Sign in again.");
          await removeAccountFromDevice(userId);
          refresh();
        } else {
          toast.error(result.error);
        }
      }"""
new = """      const result = await switchToAccount(userId);
      if (!result.ok) {
        if (result.needsLogin) {
          toast.error("Session expired for that account. Sign in again to switch.");
          refresh();
        } else {
          toast.error(result.error);
        }
      }"""
if old in ct:
    card.write_text(ct.replace(old, new, 1))
    print("card patched")
elif "Sign in again to switch" in ct:
    print("card already")
else:
    print("card MISSING")
