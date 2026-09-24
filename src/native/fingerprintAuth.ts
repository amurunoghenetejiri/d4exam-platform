/**
 * D4EXAM native fingerprint via @capgo/capacitor-native-biometric (Capacitor 8).
 * Invokes Android BiometricPrompt. Never stores fingerprint data.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import { isNativeShell, waitForNativeShell } from "@/native/platform";

export type FingerprintAvailability =
  | { ok: true; hasFingerprint: true }
  | {
      ok: false;
      reason: "web" | "no_plugin" | "no_hardware" | "not_enrolled" | "timeout" | "unknown";
      message: string;
    };

export type FingerprintAuthResult =
  | { ok: true }
  | {
      ok: false;
      code: "cancelled" | "failed" | "unavailable" | "error" | "timeout";
      message: string;
    };

type AvailableResult = {
  isAvailable: boolean;
  biometryType?: number;
  errorCode?: number;
  authenticationStrength?: number;
};

type NativeBiometricPlugin = {
  isAvailable: (opts?: { useFallback?: boolean }) => Promise<AvailableResult>;
  verifyIdentity: (opts?: Record<string, unknown>) => Promise<void>;
};

const AUTH_MS = 90_000;
const CHECK_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false;
    const t = window.setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error(`${label}_timeout`));
    }, ms);
    promise.then(
      (v) => {
        if (done) return;
        done = true;
        window.clearTimeout(t);
        resolve(v);
      },
      (e) => {
        if (done) return;
        done = true;
        window.clearTimeout(t);
        reject(e);
      },
    );
  });
}

let cachedPlugin: NativeBiometricPlugin | null = null;

function isUnimplemented(err: unknown): boolean {
  const msg = String((err as Error)?.message || err || "").toLowerCase();
  return (
    msg.includes("not implemented") ||
    msg.includes("unimplemented") ||
    msg.includes("\"code\":\"unimplemented\"") ||
    msg.includes("plugin is not implemented")
  );
}

/**
 * Resolve Capgo NativeBiometric through Capacitor bridge (works with server.url).
 */
async function getPlugin(): Promise<NativeBiometricPlugin | null> {
  // Bridge can inject after first paint when loading remote server.url
  if (!isNativeShell()) {
    const ready = await waitForNativeShell(6_000);
    if (!ready && !isNativeShell()) return null;
  }
  if (cachedPlugin) return cachedPlugin;

  // Official package export (bundled on website + APK)
  try {
    const mod = await import("@capgo/capacitor-native-biometric");
    const fromMod = (mod as { NativeBiometric?: NativeBiometricPlugin }).NativeBiometric;
    if (fromMod && typeof fromMod.verifyIdentity === "function") {
      cachedPlugin = fromMod;
      return cachedPlugin;
    }
  } catch {
    /* package may not resolve from remote host — fall through to registerPlugin */
  }

  // Capacitor bridge (injected into WebView even when loading d4exam.name.ng)
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      if (typeof Capacitor?.isPluginAvailable === "function") {
        // isPluginAvailable can lag on cold start — still try registerPlugin
      }
      const registered = registerPlugin<NativeBiometricPlugin>("NativeBiometric");
      if (registered && typeof registered.verifyIdentity === "function") {
        // Probe once; UNIMPLEMENTED means not in APK
        try {
          await withTimeout(registered.isAvailable({ useFallback: true }), 8_000, "fp_probe");
          cachedPlugin = registered;
          return cachedPlugin;
        } catch (e) {
          if (isUnimplemented(e)) return null;
          // Timeout / other: plugin may still work for verifyIdentity
          cachedPlugin = registered;
          return cachedPlugin;
        }
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }

  try {
    const plugins = (Capacitor as unknown as { Plugins?: Record<string, NativeBiometricPlugin> })
      ?.Plugins;
    const p = plugins?.NativeBiometric;
    if (p && typeof p.verifyIdentity === "function") {
      cachedPlugin = p;
      return cachedPlugin;
    }
  } catch {
    /* ignore */
  }

  return null;
}

export async function checkFingerprintAvailable(): Promise<FingerprintAvailability> {
  if (!isNativeShell()) {
    return {
      ok: false,
      reason: "web",
      message: "Fingerprint unlock is only available in the D4EXAM Android app.",
    };
  }

  const plugin = await getPlugin();
  if (!plugin) {
    return {
      ok: false,
      reason: "no_plugin",
      message:
        "Fingerprint plugin is missing from this APK. Uninstall D4EXAM completely, then install APK 1.4.3-biometric from GitHub Releases.",
    };
  }

  try {
    const info = await withTimeout(plugin.isAvailable({ useFallback: true }), CHECK_MS, "fp_check");
    if (info?.isAvailable) {
      return { ok: true, hasFingerprint: true };
    }
    // Capgo BiometricAuthError: 1 unavailable, 3 not enrolled (see package docs)
    const code = info?.errorCode;
    if (code === 3 || code === 2) {
      // 2 lockout or not enrolled depending on version — prefer enrollment message when not available
      return {
        ok: false,
        reason: "not_enrolled",
        message:
          "No fingerprint enrolled on this phone. Open Android Settings → Security → Fingerprint, add at least one, then try again.",
      };
    }
    // Hardware present but isAvailable false — still allow Enable (prompt is authoritative)
    return { ok: true, hasFingerprint: true };
  } catch (e) {
    if (isUnimplemented(e)) {
      return {
        ok: false,
        reason: "no_plugin",
        message:
          "Fingerprint plugin is missing from this APK. Uninstall D4EXAM, install APK 1.4.3-biometric.",
      };
    }
    // Optimistic: show Enable Fingerprint so user can open system prompt
    return { ok: true, hasFingerprint: true };
  }
}

/**
 * Opens the REAL Android BiometricPrompt. Call from a user tap.
 */
export async function authenticateWithFingerprint(opts?: {
  reason?: string;
  title?: string;
  subtitle?: string;
}): Promise<FingerprintAuthResult> {
  if (!isNativeShell()) {
    return {
      ok: false,
      code: "unavailable",
      message: "Fingerprint unlock is only available in the D4EXAM Android app.",
    };
  }

  const plugin = await getPlugin();
  if (!plugin) {
    return {
      ok: false,
      code: "unavailable",
      message:
        "Fingerprint plugin is missing from this APK. Uninstall D4EXAM, install APK 1.4.3-biometric.",
    };
  }

  try {
    await withTimeout(
      plugin.verifyIdentity({
        reason: opts?.reason || "Unlock D4EXAM",
        title: opts?.title || "D4EXAM",
        subtitle: opts?.subtitle || "Confirm with your fingerprint",
        description: opts?.reason || "Unlock D4EXAM",
        negativeButtonText: "Use password",
        maxAttempts: 5,
        useFallback: true,
      }),
      AUTH_MS,
      "fp_auth",
    );
    return { ok: true };
  } catch (e) {
    if (isUnimplemented(e)) {
      return {
        ok: false,
        code: "unavailable",
        message:
          "Fingerprint plugin is missing from this APK. Uninstall D4EXAM, install APK 1.4.3-biometric.",
      };
    }
    const msg = String((e as Error)?.message || e || "");
    const low = msg.toLowerCase();
    if (
      low.includes("cancel") ||
      low.includes("user canceled") ||
      low.includes("user cancelled") ||
      low.includes("10") ||
      low.includes("negative")
    ) {
      return { ok: false, code: "cancelled", message: "Fingerprint cancelled." };
    }
    if (low.includes("timeout") || low.includes("fp_auth")) {
      return { ok: false, code: "timeout", message: "Fingerprint timed out. Try again." };
    }
    if (low.includes("lockout") || low.includes("too many")) {
      return {
        ok: false,
        code: "failed",
        message: "Too many attempts. Use your app password or try again later.",
      };
    }
    return {
      ok: false,
      code: "failed",
      message: "Fingerprint not recognized. Try again or use your app password.",
    };
  }
}
