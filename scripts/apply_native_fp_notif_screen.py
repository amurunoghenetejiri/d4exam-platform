#!/usr/bin/env python3
"""Fix fingerprint / notification / screen-share native prompts on Android APK."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# ---------- 1) NotificationPermissionPrompt ----------
NP = ROOT / "src/components/NotificationPermissionPrompt.tsx"
np = NP.read_text()
old_eff = """  // After login: request REAL Android notification permission (POST_NOTIFICATIONS)
  // once per install — not a fake web dialog.
  useEffect(() => {
    const uid = session?.userId;
    if (!uid) return;
    try {
      if (localStorage.getItem("d4_native_os_notif_asked_v2") === "1") return;
    } catch {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // Wait for Capacitor bridge (critical with server.url remote load)
        const nativeReady = await waitForNativeShell(8_000);
        if (cancelled || !nativeReady) return;
        // Let splash / dashboard settle
        await new Promise((r) => setTimeout(r, 1_500));
        if (cancelled) return;
        let display = "default";
        try {
          const { registerPlugin } = await import("@capacitor/core");
          const auth = registerPlugin<{
            checkNotificationPermission: () => Promise<{ display?: string }>;
            requestNotificationPermission: () => Promise<{ display?: string }>;
          }>("D4NativeAuth");
          const cur = await auth.checkNotificationPermission();
          display = (cur?.display || "default").toLowerCase();
          if (display !== "granted" && display !== "denied") {
            const req = await auth.requestNotificationPermission();
            display = (req?.display || display).toLowerCase();
          }
        } catch {
          const { LocalNotifications } = await import("@capacitor/local-notifications");
          const cur = await LocalNotifications.checkPermissions();
          display = (cur.display || "default").toLowerCase();
          if (display !== "granted" && display !== "denied") {
            const req = await LocalNotifications.requestPermissions();
            display = (req.display || display).toLowerCase();
          }
        }
        try {
          localStorage.setItem("d4_native_os_notif_asked_v2", "1");
        } catch { /* ignore */ }
        await refreshNativePushPermissionState();
        if (display === "granted") {
          toast.success("Notifications enabled");
          try {
            const { showD4ExamNativeNotification } = await import("@/native/localNotify");
            const { notificationsEnabledConfirm } = await import("@/lib/notify-messages");
            const copy = notificationsEnabledConfirm();
            await showD4ExamNativeNotification(copy.title, copy.message, "/");
          } catch { /* ignore */ }
          // Register push listeners / token path if any
          if (session?.userId) {
            void enablePushNotifications(session.userId, session.role, { requestPermission: false });
          }
        }
      } catch (e) {
        console.warn("[D4EXAM] native notification permission", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.userId, session?.role]);"""

new_eff = """  // After login: request REAL Android notification permission (POST_NOTIFICATIONS).
  // Only mark "asked" after the OS returns granted/denied — never after a failed plugin call.
  useEffect(() => {
    const uid = session?.userId;
    if (!uid) return;
    let alreadyAsked = false;
    try {
      alreadyAsked = localStorage.getItem("d4_native_os_notif_asked_v2") === "1";
    } catch {
      alreadyAsked = false;
    }
    if (alreadyAsked) return;
    let cancelled = false;
    (async () => {
      try {
        // Wait longer for Capacitor bridge (WebView + plugins inject async)
        let nativeReady = await waitForNativeShell(12_000);
        if (!nativeReady) {
          await new Promise((r) => setTimeout(r, 2_000));
          nativeReady = await waitForNativeShell(8_000);
        }
        if (cancelled || !nativeReady) {
          console.warn("[D4EXAM] native shell not ready — will retry notification prompt next visit");
          return;
        }
        await new Promise((r) => setTimeout(r, 1_200));
        if (cancelled) return;
        let display = "default";
        try {
          const { registerPlugin } = await import("@capacitor/core");
          const auth = registerPlugin<{
            checkNotificationPermission: () => Promise<{ display?: string }>;
            requestNotificationPermission: () => Promise<{ display?: string }>;
            ping?: () => Promise<{ ok?: boolean }>;
          }>("D4NativeAuth");
          try {
            await auth.ping?.();
          } catch {
            /* plugin may still work without ping */
          }
          const cur = await auth.checkNotificationPermission();
          display = (cur?.display || "default").toLowerCase();
          if (display === "prompt") display = "default";
          if (display !== "granted" && display !== "denied") {
            const req = await auth.requestNotificationPermission();
            display = (req?.display || display).toLowerCase();
          }
        } catch (e1) {
          console.warn("[D4EXAM] D4NativeAuth notif failed, trying LocalNotifications", e1);
          try {
            const { LocalNotifications } = await import("@capacitor/local-notifications");
            const cur = await LocalNotifications.checkPermissions();
            display = (cur.display || "default").toLowerCase();
            if (display !== "granted" && display !== "denied") {
              const req = await LocalNotifications.requestPermissions();
              display = (req.display || display).toLowerCase();
            }
          } catch (e2) {
            console.warn("[D4EXAM] LocalNotifications notif failed", e2);
            return; // do NOT mark asked — retry next session
          }
        }
        // Only persist "asked" when the OS dialog actually resolved
        if (display === "granted" || display === "denied") {
          try {
            localStorage.setItem("d4_native_os_notif_asked_v2", "1");
          } catch {
            /* ignore */
          }
        }
        await refreshNativePushPermissionState();
        if (display === "granted") {
          toast.success("Notifications enabled");
          try {
            const { showD4ExamNativeNotification } = await import("@/native/localNotify");
            const { notificationsEnabledConfirm } = await import("@/lib/notify-messages");
            const copy = notificationsEnabledConfirm();
            await showD4ExamNativeNotification(copy.title, copy.message, "/");
          } catch {
            /* ignore */
          }
          if (session?.userId) {
            void enablePushNotifications(session.userId, session.role, { requestPermission: false });
          }
        }
      } catch (e) {
        console.warn("[D4EXAM] native notification permission", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.userId, session?.role]);"""

if old_eff in np:
    np = np.replace(old_eff, new_eff, 1)
    NP.write_text(np)
    print("OK: NotificationPermissionPrompt")
else:
    print("FAIL: NotificationPermissionPrompt block")

# ---------- 2) fingerprintAuth — more resilient native wait ----------
FP = ROOT / "src/native/fingerprintAuth.ts"
fp = FP.read_text()
old_ensure = """async function ensureNative(): Promise<boolean> {
  if (isNativeShell()) return true;
  return waitForNativeShell(8_000);
}"""
new_ensure = """async function ensureNative(): Promise<boolean> {
  if (isNativeShell()) return true;
  // Capacitor injects after WebView load — give the bridge more time on cold start
  if (await waitForNativeShell(12_000)) return true;
  await new Promise((r) => setTimeout(r, 1_500));
  return waitForNativeShell(8_000);
}"""
if old_ensure in fp:
    fp = fp.replace(old_ensure, new_ensure, 1)
    print("OK: ensureNative")
else:
    print("FAIL: ensureNative")

# Longer ping timeout for cold start
fp = fp.replace('await withTimeout(p.ping(), 4_000, "d4_ping");', 'await withTimeout(p.ping(), 8_000, "d4_ping");')
fp = fp.replace('await withTimeout(p.ping(), 3_000, "d4_ping");', 'await withTimeout(p.ping(), 8_000, "d4_ping");')
fp = fp.replace('await withTimeout(p.isBiometricAvailable(), 8_000, "d4_avail");', 'await withTimeout(p.isBiometricAvailable(), 12_000, "d4_avail");')
FP.write_text(fp)
print("OK: fingerprint timeouts")

# ---------- 3) screen-share isNativeAndroid + wait ----------
SS = ROOT / "src/lib/screen-share.ts"
ss = SS.read_text()
# Ensure wait uses platform waitForNativeShell if available
if 'from "@/native/platform"' not in ss and 'from "@/native/platform.ts"' not in ss:
    # add import near top after Capacitor import
    if 'from "@capacitor/core"' in ss:
        ss = ss.replace(
            'from "@capacitor/core";',
            'from "@capacitor/core";\nimport { isNativeShell, waitForNativeShell } from "@/native/platform";',
            1,
        )
        print("OK: screen-share platform import")
    else:
        print("WARN: no capacitor import in screen-share")

# Strengthen waitNativeAndroid
old_wait = None
# Find waitNativeAndroid function body - patch waitForNativeShell usage
if "async function waitNativeAndroid" in ss or "function waitNativeAndroid" in ss:
    import re
    # replace internal 6s waits with longer + platform helper
    ss2 = ss.replace("await waitNativeAndroid(6_000);", "await waitNativeAndroid(12_000);")
    ss2 = ss2.replace("await waitNativeAndroid(8_000);", "await waitNativeAndroid(12_000);")
    if ss2 != ss:
        ss = ss2
        print("OK: waitNativeAndroid longer")
else:
    print("WARN: waitNativeAndroid not found")

# In isNativeAndroid, also check isNativeShell
old_ina = """export function isNativeAndroid(): boolean {
  try {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") return true;
  } catch {
    /* ignore */
  }"""
new_ina = """export function isNativeAndroid(): boolean {
  try {
    if (typeof isNativeShell === "function" && isNativeShell()) {
      try {
        if (Capacitor.getPlatform() === "android") return true;
      } catch {
        return true; // native shell on this app is Android-only
      }
    }
  } catch {
    /* ignore */
  }
  try {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") return true;
  } catch {
    /* ignore */
  }"""
if old_ina in ss:
    ss = ss.replace(old_ina, new_ina, 1)
    print("OK: isNativeAndroid")
else:
    print("FAIL: isNativeAndroid")

SS.write_text(ss)

# ---------- 4) Java: treat PROMPT correctly is already OK; ensure authenticate rejects cleanly ----------
# Soften BIOMETRIC: use WEAK if STRONG+WEAK fails on some OEMs
JAVA = ROOT / "android/app/src/main/java/com/d4exam/app/D4NativeAuthPlugin.java"
if JAVA.is_file():
    j = JAVA.read_text()
    # In isBiometricAvailable, also try BIOMETRIC_WEAK alone if combined fails
    old_can = """      int can =
          bm.canAuthenticate(
              BiometricManager.Authenticators.BIOMETRIC_WEAK
                  | BiometricManager.Authenticators.BIOMETRIC_STRONG);"""
    new_can = """      int can =
          bm.canAuthenticate(
              BiometricManager.Authenticators.BIOMETRIC_WEAK
                  | BiometricManager.Authenticators.BIOMETRIC_STRONG);
      if (can != BiometricManager.BIOMETRIC_SUCCESS
          && can != BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) {
        // Some OEMs reject STRONG|WEAK; retry WEAK only
        int weakOnly = bm.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK);
        if (weakOnly == BiometricManager.BIOMETRIC_SUCCESS
            || weakOnly == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) {
          can = weakOnly;
        }
      }"""
    if old_can in j:
        j = j.replace(old_can, new_can, 1)
        JAVA.write_text(j)
        print("OK: biometric weak fallback")
    else:
        print("FAIL: biometric canAuthenticate block")

print("DONE")

# waitNativeAndroid strengthen
SS = ROOT / "src/lib/screen-share.ts"
ss = SS.read_text()
oldw = """export async function waitNativeAndroid(timeoutMs = 6_000): Promise<boolean> {
  if (isNativeAndroid()) return true;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (isNativeAndroid()) return true;
    try {
      if (Capacitor.isNativePlatform()) return true;
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return isNativeAndroid();
}"""
neww = """export async function waitNativeAndroid(timeoutMs = 12_000): Promise<boolean> {
  if (isNativeAndroid()) return true;
  try {
    if (await waitForNativeShell(Math.min(timeoutMs, 12_000))) {
      if (isNativeAndroid()) return true;
    }
  } catch {
    /* ignore */
  }
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (isNativeAndroid()) return true;
    try {
      if (Capacitor.isNativePlatform()) return true;
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return isNativeAndroid();
}"""
if oldw in ss:
    SS.write_text(ss.replace(oldw, neww, 1))
    print("OK: waitNativeAndroid body")
