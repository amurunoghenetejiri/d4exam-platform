import { useCallback, useEffect, useRef, useState } from "react";
import { Fingerprint, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { useSessionUser } from "@/lib/session";
import { isNativeShell } from "@/native/platform";
import {
  authenticateWithFingerprint,
  checkFingerprintAvailable,
  type FingerprintAvailability,
} from "@/native/fingerprintAuth";
import {
  disableFingerprint,
  enableFingerprintFor,
  isFingerprintEnabledFor,
} from "@/lib/fingerprint-lock";

export function FingerprintLockCard() {
  const { data: session } = useSessionUser();
  const native = isNativeShell();
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [availability, setAvailability] = useState<FingerprintAvailability | null>(null);
  const runningRef = useRef(false);

  const refresh = useCallback(() => {
    setEnabled(isFingerprintEnabledFor(session?.userId));
  }, [session?.userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!native) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      void checkFingerprintAvailable().then((a) => {
        if (!cancelled) setAvailability(a);
      });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [native]);

  if (!native) {
    return null;
  }

  const unavailableMsg =
    availability && !availability.ok && availability.reason !== "timeout"
      ? availability.message
      : null;

  async function onEnable() {
    if (!session?.userId) {
      toast.error("Sign in required.");
      return;
    }
    if (runningRef.current || busy) return;
    runningRef.current = true;
    setBusy(true);

    try {
      const avail = await checkFingerprintAvailable();
      setAvailability(avail);
      if (!avail.ok) {
        toast.error(avail.message);
        return;
      }

      const auth = await authenticateWithFingerprint({
        reason: "Confirm your fingerprint to enable unlock for D4EXAM",
        title: "Enable Fingerprint",
        subtitle: "Touch the sensor to continue",
      });

      if (!auth.ok) {
        if (auth.code === "cancelled") {
          toast.message("Fingerprint cancelled.");
        } else if (auth.code === "timeout") {
          toast.error(
            "Fingerprint prompt closed without a match. Enroll a fingerprint in phone Settings, then try again.",
          );
        } else {
          toast.error(auth.message);
          setAvailability({
            ok: false,
            reason: auth.code === "unavailable" ? "no_plugin" : "unknown",
            message: auth.message,
          });
        }
        return;
      }

      enableFingerprintFor(session.userId);
      setEnabled(true);
      setAvailability({ ok: true, hasFingerprint: true });
      toast.success(
        "Fingerprint unlock enabled. Use it when you reopen the app after 30 seconds in the background.",
      );
    } catch (e) {
      toast.error((e as Error)?.message || "Could not enable fingerprint.");
    } finally {
      runningRef.current = false;
      setBusy(false);
    }
  }

  function onDisable() {
    disableFingerprint();
    setEnabled(false);
    toast.success("Fingerprint unlock disabled.");
  }

  return (
    <SectionCard title="Security" description="Fingerprint unlock for this device">
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary">
            <Fingerprint className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">Fingerprint Unlock</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              Use your fingerprint to unlock D4EXAM after the app is in the background for 30
              seconds, or when you reopen the app. Your fingerprint stays on this device —
              D4EXAM never stores it.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Status:{" "}
              <span className={`font-semibold ${enabled ? "text-emerald-600" : "text-slate-700"}`}>
                {enabled ? "Enabled" : "Disabled"}
              </span>
            </p>
          </div>
        </div>

        {unavailableMsg && !enabled && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{unavailableMsg}</p>
        )}

        {enabled ? (
          <Button type="button" variant="outline" disabled={busy} onClick={onDisable}>
            Disable Fingerprint
          </Button>
        ) : (
          <Button type="button" disabled={busy} onClick={() => void onEnable()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {busy ? "Touch the fingerprint sensor…" : "Enable Fingerprint"}
          </Button>
        )}
      </div>
    </SectionCard>
  );
}
