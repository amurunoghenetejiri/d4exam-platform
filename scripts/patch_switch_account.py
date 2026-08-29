from pathlib import Path
p = Path("src/lib/account-switcher.ts")
t = p.read_text()
start = t.find("export async function switchToAccount")
end = t.find("/** Log out of the current account only", start)
if start < 0 or end < 0:
    raise SystemExit("markers missing")
new_fn = Path("scripts/_switch_to_account_fn.ts").read_text()
if not new_fn.endswith("\n"):
    new_fn += "\n"
p.write_text(t[:start] + new_fn + t[end:])
print("patched switchToAccount")
