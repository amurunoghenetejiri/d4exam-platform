from pathlib import Path
p = Path("src/lib/screen-share.ts")
t = p.read_text()
if "export async function ensureScreenShareRunning" in t:
    print("already")
else:
    wrapper = """
/** Re-attach / restart native capture if exam hold is on but frames stopped. */
export async function ensureScreenShareRunning(): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  try {
    const ensured = await D4ScreenShare().ensureRunning();
    const active = Boolean((ensured as { active?: boolean })?.active ?? ensured);
    if (active) {
      nativeActive = true;
      status = "active";
      examHoldLock = true;
      try { await D4ScreenShare().setKeepAlive({ hold: true }); } catch { /* ignore */ }
    }
    return active;
  } catch {
    return false;
  }
}

"""
    key = "export function stopScreenShareStream"
    if key in t:
        t = t.replace(key, wrapper + key, 1)
        p.write_text(t)
        print("inserted")
    else:
        p.write_text(t + "\n" + wrapper)
        print("appended")
