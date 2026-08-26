import { useEffect, useState } from "react";
import { subscribeOfflineSync } from "@/lib/offline-sync";
import { subscribeSyncStatus, getSyncSnapshot } from "@/lib/sync/status";

/**
 * Tiny non-blocking status pill. Does not redesign the app.
 * Hidden when online and idle.
 */
export function OfflineStatusPill() {
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const u1 = subscribeOfflineSync((info) => {
      setOnline(info.online);
      setSyncing(info.syncing);
    });
    const u2 = subscribeSyncStatus((s) => {
      setSyncing(s.status === "SYNCING" || s.phase === "pushing" || s.phase === "pulling");
      if (s.status === "OFFLINE" || !s.online) setLabel("Offline — using saved data");
      else if (s.status === "SYNCING") setLabel("Syncing…");
      else if (s.status === "FAILED") setLabel("Sync issue");
      else setLabel(null);
    });
    const snap = getSyncSnapshot();
    if (!snap.online) setLabel("Offline — using saved data");
    return () => {
      u1();
      u2();
    };
  }, []);

  const text =
    label ||
    (!online ? "Offline — using saved data" : syncing ? "Syncing…" : null);

  if (!text) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-3 left-1/2 z-[80] -translate-x-1/2 px-3"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div
        className="rounded-full px-3 py-1 text-[11px] font-medium shadow-md"
        style={{
          background: "rgba(11, 27, 58, 0.92)",
          color: "#e2e8f0",
          border: "1px solid rgba(148, 163, 184, 0.35)",
        }}
      >
        {text}
      </div>
    </div>
  );
}
