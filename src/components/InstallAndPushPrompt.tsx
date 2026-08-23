import { useEffect, useRef } from "react";
import { enablePushNotifications, getPushPermissionState } from "@/lib/push";
import { useSessionUser } from "@/lib/session";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return true;
  const mq = window.matchMedia("(display-mode: standalone)").matches;
  const ios =
    "standalone" in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return mq || ios;
}

/**
 * Native-only prompts (no custom card / floating bell):
 * - Chrome "Install app" dialog via beforeinstallprompt
 * - Browser notification permission dialog
 * Stops once installed + notifications granted.
 * Shows again only if app is removed or permission is reset.
 */
export function InstallAndPushPrompt() {
  const { data: session } = useSessionUser();
  const installTried = useRef(false);
  const pushTried = useRef(false);
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onBip = (e: Event) => {
      e.preventDefault();
      deferredRef.current = e as BeforeInstallPromptEvent;
      void maybeInstall();
    };

    const onInstalled = () => {
      deferredRef.current = null;
      installTried.current = true;
    };

    async function maybeInstall() {
      if (isStandaloneDisplay()) return;
      if (installTried.current) return;
      const ev = deferredRef.current;
      if (!ev) return;
      installTried.current = true;
      try {
        await ev.prompt();
        const choice = await ev.userChoice;
        if (choice.outcome === "accepted") {
          deferredRef.current = null;
        } else {
          // User cancelled — allow another try later this session after navigation / delay
          installTried.current = false;
          deferredRef.current = ev;
          window.setTimeout(() => {
            void maybeInstall();
          }, 45_000);
        }
      } catch {
        installTried.current = false;
      }
    }

    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);

    // If event already fired before listener (rare), nothing to do until next visit
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!session?.userId) return;
    if (pushTried.current) return;

    const perm = getPushPermissionState();
    if (perm === "granted" || perm === "unsupported") return;
    // If permanently denied, browser will not show the dialog again until user resets site settings
    if (perm === "denied") return;

    pushTried.current = true;
    const t = window.setTimeout(() => {
      void enablePushNotifications(session.userId, session.role).then((r) => {
        if (!r.ok && getPushPermissionState() === "default") {
          // Permission UI not shown / not decided — retry once later
          pushTried.current = false;
        }
      });
    }, 1200);

    return () => window.clearTimeout(t);
  }, [session?.userId, session?.role]);

  // Re-offer install when user returns to the tab if still not installed
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (isStandaloneDisplay()) return;
      if (!deferredRef.current) return;
      if (installTried.current) return;
      installTried.current = true;
      void deferredRef.current
        .prompt()
        .then(() => deferredRef.current?.userChoice)
        .then((choice) => {
          if (choice && choice.outcome !== "accepted") {
            installTried.current = false;
          }
        })
        .catch(() => {
          installTried.current = false;
        });
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return null;
}
