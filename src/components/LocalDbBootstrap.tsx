import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { initLocalDb, getLocalDbCapability } from "@/lib/local-db";

/**
 * Initializes local SQLite (native) or memory fallback (web).
 * Does not alter UI/UX. Safe no-op if init fails.
 */
export function LocalDbBootstrap() {
  useEffect(() => {
    let cancelled = false;
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
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
