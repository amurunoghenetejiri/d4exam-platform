import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { initLocalDb, getLocalDbCapability } from "@/lib/local-db";

/**
 * Initializes local SQLite (native) or memory fallback (web).
 * Deferred so first paint is never blocked (was a major mobile lag source).
 */
export function LocalDbBootstrap() {
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      void (async () => {
        try {
          await initLocalDb({ forceMemory: !Capacitor.isNativePlatform() });
          if (!cancelled && typeof console !== "undefined") {
            const cap = getLocalDbCapability();
            if (cap.available) {
              console.info("[local-db] ready", cap.backend, cap.dbName, `v${cap.version}`);
            }
          }
        } catch (e) {
          console.warn("[local-db] bootstrap failed", e);
        }
      })();
    };
    const ric = (
      window as unknown as {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      }
    ).requestIdleCallback;
    let idleId = 0;
    let timeoutId = 0;
    if (typeof ric === "function") {
      idleId = ric(run, { timeout: 2500 });
    } else {
      timeoutId = window.setTimeout(run, 1200) as unknown as number;
    }
    return () => {
      cancelled = true;
      if (
        idleId &&
        (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback
      ) {
        (window as unknown as { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(
          idleId,
        );
      }
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, []);
  return null;
}
