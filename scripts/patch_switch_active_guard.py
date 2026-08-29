from pathlib import Path
card = Path("src/components/settings/SwitchAccountCard.tsx")
ct = card.read_text()
old = """  async function onSwitch(userId: string) {
    if (userId === session?.userId) {
      toast.message("Already signed in as this account.");
      return;
    }"""
new = """  async function onSwitch(userId: string) {
    const activeId = session?.userId;
    if (userId === activeId) {
      toast.message("Already signed in as this account.");
      return;
    }
    // Also treat vault-active card as current when session is still loading
    const listed = accounts.find((a) => a.userId === userId);
    if (listed?.isActive && activeId && listed.userId === activeId) {
      toast.message("Already signed in as this account.");
      return;
    }"""
if old in ct:
    card.write_text(ct.replace(old, new, 1))
    print("guard ok")
elif "vault-active card" in ct:
    print("guard already")
else:
    print("guard MISSING")
