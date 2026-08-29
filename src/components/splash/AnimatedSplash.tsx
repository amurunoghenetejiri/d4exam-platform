import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { hideSplashSafely } from "@/native/statusBar";

/** Minimum time the splash stays on screen (ms). */
const SPLASH_MIN_MS = 2800;
/** Absolute safety cap so splash never blocks forever. */
const SPLASH_MAX_MS = 20000;
/** Marks splash already dismissed for this app process / tab session. */
const SESSION_KEY = "d4exam_splash_shown_v6";

function isAppShellContext(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const cap = (window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
    }).Capacitor;
    if (cap?.isNativePlatform?.()) return true;
    const p = cap?.getPlatform?.();
    if (p === "android" || p === "ios") return true;
  } catch {
    /* ignore */
  }
  try {
    const ua = navigator.userAgent || "";
    if (/Android/i.test(ua) && (/; wv\)/i.test(ua) || /Capacitor/i.test(ua))) {
      return true;
    }
  } catch {
    /* ignore */
  }
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
    if (window.matchMedia("(display-mode: minimal-ui)").matches) return true;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    if (nav.standalone === true) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function markSplashShown(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

function wasSplashShownThisSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function removeBootSplashDom(): void {
  try {
    const el = document.getElementById("d4-boot-splash");
    if (el) {
      el.style.opacity = "0";
      el.style.pointerEvents = "none";
      window.setTimeout(() => el.remove(), 200);
    }
  } catch {
    /* ignore */
  }
}

/**
 * D4EXAM app splash (native + installed PWA only).
 * Simple centered logo design — not the animated rings version.
 * Slogan at bottom: SMART. SECURE. SEAMLESS.
 * Website browsers never see this component.
 */
export function AnimatedSplash({ force = false }: { force?: boolean }) {
  const startRef = useRef<number>(
    typeof performance !== "undefined" ? performance.now() : Date.now(),
  );
  const [visible, setVisible] = useState(() => {
    if (force) return true;
    if (typeof window === "undefined") return false;
    if (wasSplashShownThisSession()) return false;
    return isAppShellContext();
  });
  const [exiting, setExiting] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const dismissedRef = useRef(false);

  useEffect(() => {
    if (force || visible || wasSplashShownThisSession()) return;
    const tryShow = () => {
      if (!dismissedRef.current && isAppShellContext() && !wasSplashShownThisSession()) {
        setVisible(true);
        startRef.current =
          typeof performance !== "undefined" ? performance.now() : Date.now();
      }
    };
    tryShow();
    const t1 = window.setTimeout(tryShow, 80);
    const t2 = window.setTimeout(tryShow, 400);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [force, visible]);

  // When splash is up: drop HTML boot layer + native Capacitor splash
  useEffect(() => {
    if (!visible) return;
    removeBootSplashDom();
    void hideSplashSafely();
    const t1 = window.setTimeout(() => void hideSplashSafely(), 120);
    const t2 = window.setTimeout(() => void hideSplashSafely(), 500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [visible]);

  useEffect(() => {
    if (visible) return;
    if (!isAppShellContext() || wasSplashShownThisSession()) {
      removeBootSplashDom();
      void hideSplashSafely();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const markReady = () => {
      if (cancelled) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cancelled) setAppReady(true);
        });
      });
    };
    markReady();
    const onLoad = () => markReady();
    if (document.readyState === "complete") markReady();
    else window.addEventListener("load", onLoad);
    const safety = window.setTimeout(() => {
      if (!cancelled) setAppReady(true);
    }, 4000);
    return () => {
      cancelled = true;
      window.removeEventListener("load", onLoad);
      window.clearTimeout(safety);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || dismissedRef.current) return;
    let cancelled = false;

    const tryDismiss = () => {
      if (cancelled || dismissedRef.current) return;
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const elapsed = now - startRef.current;
      if (elapsed >= SPLASH_MIN_MS && appReady) {
        dismissedRef.current = true;
        markSplashShown();
        setExiting(true);
        window.setTimeout(() => {
          setVisible(false);
          removeBootSplashDom();
          void hideSplashSafely();
        }, 280);
        return;
      }
      if (elapsed >= SPLASH_MAX_MS) {
        dismissedRef.current = true;
        markSplashShown();
        setExiting(true);
        window.setTimeout(() => {
          setVisible(false);
          removeBootSplashDom();
          void hideSplashSafely();
        }, 200);
      }
    };

    tryDismiss();
    const id = window.setInterval(tryDismiss, 120);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [visible, appReady]);

  if (!visible) return null;

  return (
    <div
      role="img"
      aria-label="D4EXAM"
      className={cn(
        "fixed inset-0 z-[2147483645] flex flex-col items-center justify-center",
        "bg-[#0b1b3a] text-white transition-opacity duration-300",
        exiting ? "opacity-0 pointer-events-none" : "opacity-100",
      )}
    >
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <img
          src="/logo.png"
          alt=""
          width={160}
          height={160}
          className="h-[min(40vw,160px)] w-[min(40vw,160px)] object-contain"
          draggable={false}
        />
        <h1 className="mt-5 text-center text-[clamp(1.5rem,6vw,2.25rem)] font-extrabold tracking-[0.14em]">
          D<span className="text-blue-600">4</span>EXAM
        </h1>
        <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">
          Smart Examination System
        </p>
      </div>

      <div className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-0 right-0 px-8 text-center">
        <p className="text-[10px] font-semibold tracking-[0.28em] text-slate-400 sm:text-[11px]">
          SMART. <span className="text-blue-400">SECURE.</span> SEAMLESS.
        </p>
      </div>
    </div>
  );
}
