import { useEffect, useRef, useState } from "react";
import { hideSplashSafely } from "@/native/statusBar";

/** Plain branded splash duration (ms). */
const SPLASH_MIN_MS = 2200;
const SPLASH_MAX_MS = 8000;
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
    if (/Android/i.test(ua) && (/; wv\)/i.test(ua) || /Capacitor/i.test(ua))) return true;
  } catch {
    /* ignore */
  }
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
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
      window.setTimeout(() => el.remove(), 150);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Plain static D4EXAM splash (native / PWA only).
 * No animation rings — solid navy + logo + title + motto at bottom.
 */
export function AnimatedSplash({ force = false }: { force?: boolean }) {
  const startRef = useRef<number>(
    typeof performance !== "undefined" ? performance.now() : Date.now(),
  );
  const [visible, setVisible] = useState(() => {
    if (force) return true;
    if (typeof window === "undefined") return false;
    if (!isAppShellContext()) return false;
    if (wasSplashShownThisSession()) return false;
    return true;
  });
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    if (!visible) {
      removeBootSplashDom();
      void hideSplashSafely();
      return;
    }
    removeBootSplashDom();
    void hideSplashSafely();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const markReady = () => {
      if (!cancelled) setAppReady(true);
    };
    if (typeof document !== "undefined" && document.readyState === "complete") {
      markReady();
    } else if (typeof window !== "undefined") {
      window.addEventListener("load", markReady, { once: true });
    } else {
      markReady();
    }
    const maxTimer = window.setTimeout(markReady, SPLASH_MAX_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(maxTimer);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || !appReady) return;
    const elapsed =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - startRef.current;
    const wait = Math.max(0, SPLASH_MIN_MS - elapsed);
    const t = window.setTimeout(() => {
      markSplashShown();
      setVisible(false);
    }, wait);
    return () => window.clearTimeout(t);
  }, [visible, appReady]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[2147483645] flex flex-col items-center justify-center"
      style={{ background: "#0b1b3a" }}
      role="status"
      aria-label="Loading D4EXAM"
    >
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <img
          src="/apple-touch-icon.png"
          alt="D4EXAM"
          width={160}
          height={160}
          className="h-[min(40vw,160px)] w-[min(40vw,160px)] object-contain"
          draggable={false}
        />
        <h1
          className="mt-6 text-center font-extrabold tracking-[0.14em] text-white"
          style={{ fontSize: "clamp(1.5rem, 6vw, 2.25rem)" }}
        >
          D<span style={{ color: "#2563eb" }}>4</span>EXAM
        </h1>
        <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">
          Smart Examination System
        </p>
      </div>

      <div
        className="pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 text-center"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <p className="text-[10px] font-semibold tracking-[0.28em] text-slate-400 sm:text-[11px]">
          SMART. <span style={{ color: "#60a5fa" }}>SECURE.</span> SEAMLESS.
        </p>
      </div>
    </div>
  );
}
