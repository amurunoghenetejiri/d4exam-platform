/**
 * First-login app password setup — same navy full-screen style as unlock.
 * User creates password + confirm, then uses it on the unlock screen next time.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouterState } from "@tanstack/react-router";
import { KeyRound, Loader2, Fingerprint, Shield } from "lucide-react";
import { toast } from "sonner";
import { isNativeShell } from "@/native/platform";
import { useSessionUser } from "@/lib/session";
import { hasAppUnlockFor, setAppUnlockPassword } from "@/lib/app-unlock";
import {
  isBiometricAvailable,
  isFingerprintEnabledFor,
  setFingerprintEnabledFor,
  verifyIdentity,
} from "@/lib/biometric";

const THEME_NAVY = "#0b1b3a";
const SETUP_DONE_PREFIX = "d4exam_unlock_setup_done_v1:";

function setupDoneKey(userId: string) {
  return `${SETUP_DONE_PREFIX}${userId}`;
}

function markSetupDone(userId: string) {
  try {
    window.localStorage.setItem(setupDoneKey(userId), "1");
  } catch {
    /* ignore */
  }
}

function isSetupDone(userId: string) {
  try {
    return window.localStorage.getItem(setupDoneKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function AppUnlockSetupGate() {
  const native = isNativeShell();
  const { data: session } = useSessionUser();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [needed, setNeeded] = useState(false);
  const [step, setStep] = useState<"password" | "fingerprint">("password");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fpAvailable, setFpAvailable] = useState(false);

  const isPublicAuthPath =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/forgot") ||
    pathname.startsWith("/forgot-app-password") ||
    pathname.startsWith("/reset-app-password") ||
    pathname.startsWith("/apply") ||
    pathname.startsWith("/reset-password");

  useEffect(() => {
    if (isPublicAuthPath || !session?.userId) {
      setNeeded(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        if (isSetupDone(session.userId)) {
          if (!cancelled) setNeeded(false);
          return;
        }
        const has = await hasAppUnlockFor(session.userId);
        if (cancelled) return;
        if (has) {
          markSetupDone(session.userId);
          setNeeded(false);
          return;
        }
        setNeeded(true);
        setStep("password");
        try {
          const avail = await isBiometricAvailable();
          if (!cancelled) setFpAvailable(Boolean(avail));
        } catch {
          if (!cancelled) setFpAvailable(false);
        }
      } catch {
        if (!cancelled) setNeeded(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.userId, isPublicAuthPath, pathname]);

  async function onSetPassword() {
    if (!session?.userId) return;
    setErr(null);
    const a = pw1.trim();
    const b = pw2.trim();
    if (a.length < 4) {
      setErr("App password must be at least 4 characters.");
      return;
    }
    if (a !== b) {
      setErr("Passwords do not match. Confirm again.");
      return;
    }
    setBusy(true);
    try {
      await setAppUnlockPassword(session.userId, a);
      markSetupDone(session.userId);
      toast.success("App password created");
      if (fpAvailable && !isFingerprintEnabledFor(session.userId)) {
        setStep("fingerprint");
      } else {
        setNeeded(false);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save app password.");
    } finally {
      setBusy(false);
    }
  }

  async function onEnableFp() {
    if (!session?.userId) return;
    setBusy(true);
    try {
      const ok = await verifyIdentity({
        reason: "Enable fingerprint unlock for D4EXAM",
      });
      if (ok) {
        setFingerprintEnabledFor(session.userId, true);
        toast.success("Fingerprint unlock enabled");
      } else {
        toast.message("Fingerprint not enabled — you can turn it on in Settings.");
      }
    } catch {
      toast.message("Fingerprint skipped — use your app password to unlock.");
    } finally {
      setBusy(false);
      setNeeded(false);
    }
  }

  if (!needed || !session?.userId || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="d4-app-unlock-setup"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147482500,
        backgroundColor: THEME_NAVY,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.25rem",
        boxSizing: "border-box",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Create app password"
    >
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-blue-600/25 text-blue-300 ring-1 ring-blue-400/30">
            {step === "password" ? <KeyRound className="h-7 w-7" /> : <Fingerprint className="h-7 w-7" />}
          </div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-300/90">D4EXAM Security</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-white">
            {step === "password" ? "Create App Password" : "Enable Fingerprint?"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            {step === "password"
              ? "This password unlocks D4EXAM when you return. It is not your school login password."
              : "Optionally unlock with your fingerprint next time. You can change this in Settings."}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl backdrop-blur-sm">
          {step === "password" ? (
            <>
              <label className="block text-xs font-semibold text-slate-300">Enter App Password</label>
              <input
                type="password"
                autoComplete="new-password"
                value={pw1}
                onChange={(e) => setPw1(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-400"
                placeholder="Min. 4 characters"
              />
              <label className="mt-3 block text-xs font-semibold text-slate-300">Confirm App Password</label>
              <input
                type="password"
                autoComplete="new-password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void onSetPassword();
                }}
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-400"
                placeholder="Re-enter password"
              />
              {err ? (
                <p className="mt-2 text-center text-xs font-semibold text-amber-300">{err}</p>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => void onSetPassword()}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-900/40 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                Create App Password
              </button>
              <p className="mt-3 text-center text-[11px] text-slate-500">
                After this, use the same password on the unlock screen to open your dashboard.
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onEnableFp()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
                Enable Fingerprint
              </button>
              <button
                type="button"
                className="mt-3 w-full py-2.5 text-sm font-medium text-slate-400 hover:text-white"
                onClick={() => {
                  setNeeded(false);
                  toast.success("App password saved");
                }}
              >
                Skip for now
              </button>
            </>
          )}
        </div>

        {!native ? (
          <p className="mt-4 text-center text-[10px] text-slate-500">
            Works on website and app — same unlock password for this account on this device.
          </p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
