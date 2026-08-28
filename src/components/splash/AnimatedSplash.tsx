import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { hideSplashSafely } from "@/native/statusBar";

/** Minimum time the branded splash stays on screen (ms). */
const SPLASH_MIN_MS = 9000;
/** Absolute safety cap so splash never blocks forever. */
const SPLASH_MAX_MS = 45000;
/** Marks splash already shown for this app process / tab session. */
const SESSION_KEY = "d4exam_splash_shown_v4";

/**
 * Splash is ONLY for:
 * - Capacitor Android/iOS native shell
 * - Installed PWA (Add to Home Screen / standalone)
 *
 * Never on the regular website browser, and never again after
 * in-app / in-PWA navigation within the same session.
 */
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
    // Installed PWA (Android / desktop)
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
    if (window.matchMedia("(display-mode: minimal-ui)").matches) return true;
    // iOS Safari "Add to Home Screen"
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

/**
 * Live animated D4EXAM splash (native app + installed PWA only).
 * - Minimum 9 seconds on cold open
 * - Stays until the app shell is ready (capped at 45s)
 * - Background = app theme navy (#0b1b3a)
 * - Offline-safe (bundled /logo.png)
 */
export function AnimatedSplash({ force = false }: { force?: boolean }) {
  const startRef = useRef<number>(typeof performance !== "undefined" ? performance.now() : Date.now());
  const [visible, setVisible] = useState(() => {
    if (force) return true;
    // Website (browser tab): never show splash
    if (!isAppShellContext()) return false;
    // Already shown this app session (login redirect / route change): skip
    if (wasSplashShownThisSession()) return false;
    // Cold open of native app or installed PWA — show once
    markSplashShown();
    return true;
  });
  const [exiting, setExiting] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const dismissedRef = useRef(false);

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.matchMedia) {
        setReduceMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Dismiss native logo-only splash only when we are in the app shell
  useEffect(() => {
    if (!isAppShellContext()) return;
    void hideSplashSafely();
    const t1 = window.setTimeout(() => void hideSplashSafely(), 400);
    const t2 = window.setTimeout(() => void hideSplashSafely(), 1500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  // Track when the app document / shell is ready to show
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

    if (typeof document !== "undefined" && document.readyState === "complete") {
      markReady();
    } else if (typeof window !== "undefined") {
      window.addEventListener("load", markReady, { once: true });
    } else {
      markReady();
    }

    const maxTimer = window.setTimeout(() => {
      if (!cancelled) setAppReady(true);
    }, SPLASH_MAX_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(maxTimer);
      if (typeof window !== "undefined") {
        window.removeEventListener("load", markReady);
      }
    };
  }, [visible]);

  // Dismiss only after min 9s AND app is ready
  useEffect(() => {
    if (!visible || dismissedRef.current) return;

    const tick = () => {
      if (dismissedRef.current) return;
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const elapsed = now - startRef.current;
      if (elapsed >= SPLASH_MIN_MS && appReady) {
        dismissedRef.current = true;
        setExiting(true);
        markSplashShown();
        window.setTimeout(() => setVisible(false), 450);
        return;
      }
      window.setTimeout(tick, 120);
    };

    const id = window.setTimeout(tick, 120);
    return () => window.clearTimeout(id);
  }, [visible, appReady]);

  if (!visible) return null;

  const motionOff = reduceMotion;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[99999] flex flex-col items-center justify-center overflow-hidden",
        "bg-[#0b1b3a] text-white select-none",
        exiting && "pointer-events-none opacity-0 transition-opacity duration-450 ease-out",
      )}
      style={{ transitionDuration: exiting ? "450ms" : undefined }}
      role="img"
      aria-label="D4EXAM loading"
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          !motionOff && "animate-[d4SplashGlow_3.2s_ease-in-out_infinite]",
        )}
        style={{
          background:
            "radial-gradient(ellipse 55% 40% at 50% 32%, rgba(37,99,235,0.35) 0%, rgba(11,27,58,0) 70%)",
        }}
      />

      {!motionOff && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {Array.from({ length: 14 }).map((_, i) => (
            <span
              key={i}
              className="absolute h-1 w-1 rounded-full bg-sky-300/70 animate-[d4SplashParticle_6s_ease-in-out_infinite]"
              style={{
                left: `${8 + ((i * 17) % 84)}%`,
                top: `${12 + ((i * 23) % 70)}%`,
                animationDelay: `${(i % 7) * 0.35}s`,
                opacity: 0.35 + (i % 5) * 0.08,
              }}
            />
          ))}
        </div>
      )}

      <div className="relative z-10 flex flex-col items-center px-6 pt-[8vh]">
        <div
          className={cn(
            "relative grid place-items-center",
            !motionOff && "animate-[d4SplashLogoIn_0.7s_cubic-bezier(0.22,1,0.36,1)_both]",
          )}
        >
          {!motionOff && (
            <>
              <span
                className="absolute h-[min(58vw,240px)] w-[min(58vw,240px)] rounded-full border border-sky-400/25 animate-[d4SplashSpin_18s_linear_infinite]"
                aria-hidden
              />
              <span
                className="absolute h-[min(72vw,300px)] w-[min(72vw,300px)] rounded-full border border-blue-400/15 animate-[d4SplashSpin_28s_linear_infinite_reverse]"
                aria-hidden
              />
              <span
                className="absolute h-[min(46vw,190px)] w-[min(46vw,190px)] rounded-full border border-cyan-300/20 animate-[d4SplashSpin_12s_linear_infinite]"
                style={{ borderStyle: "dashed" }}
                aria-hidden
              />
            </>
          )}

          <div
            className={cn(
              "absolute h-[min(42vw,170px)] w-[min(42vw,170px)] rounded-full bg-blue-500/25 blur-2xl",
              !motionOff && "animate-[d4SplashPulse_2.8s_ease-in-out_infinite]",
            )}
            aria-hidden
          />

          <img
            src="/logo.png"
            alt="D4EXAM"
            className="relative z-10 h-[min(42vw,168px)] w-[min(42vw,168px)] object-contain drop-shadow-[0_8px_28px_rgba(37,99,235,0.45)]"
            draggable={false}
          />
        </div>

        <div
          className={cn(
            "mt-7 text-center",
            !motionOff && "animate-[d4SplashTextIn_0.65s_0.35s_cubic-bezier(0.22,1,0.36,1)_both]",
          )}
        >
          <h1 className="text-[clamp(1.75rem,7vw,2.35rem)] font-extrabold tracking-[0.12em]">
            <span className="text-white">D</span>
            <span className="text-blue-500">4</span>
            <span className="text-white">EXAM</span>
          </h1>
          <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-300/90">
            Smart Examination System
          </p>
        </div>

        <div
          className={cn(
            "mt-8 flex items-center justify-center gap-6 sm:gap-10",
            !motionOff && "animate-[d4SplashTextIn_0.55s_0.55s_cubic-bezier(0.22,1,0.36,1)_both]",
          )}
        >
          {(
            [
              { label: "SMART.", delay: "0.55s" },
              { label: "SECURE.", delay: "0.75s" },
              { label: "SEAMLESS.", delay: "0.95s" },
            ] as const
          ).map((item) => (
            <span
              key={item.label}
              className={cn(
                "text-[11px] font-bold tracking-[0.18em] text-slate-200",
                !motionOff && "animate-[d4SplashWord_0.5s_cubic-bezier(0.22,1,0.36,1)_both]",
              )}
              style={!motionOff ? { animationDelay: item.delay } : undefined}
            >
              {item.label}
            </span>
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[28vh] overflow-hidden">
        <div
          className={cn(
            "absolute inset-0 opacity-70",
            !motionOff && "animate-[d4SplashWave_10s_linear_infinite]",
          )}
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 80%, rgba(59,130,246,0.35) 0%, transparent 40%), radial-gradient(circle at 80% 90%, rgba(14,165,233,0.25) 0%, transparent 35%), repeating-linear-gradient(90deg, transparent 0 6px, rgba(59,130,246,0.12) 6px 7px)",
            maskImage: "linear-gradient(to top, black 20%, transparent 95%)",
            WebkitMaskImage: "linear-gradient(to top, black 20%, transparent 95%)",
          }}
        />
      </div>

      <div className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-0 right-0 z-20 flex flex-col items-center gap-3 px-8">
        <p className="text-[10px] font-semibold tracking-[0.28em] text-slate-400">
          SMART. <span className="text-blue-400">SECURE.</span> SEAMLESS.
        </p>
        <div className="h-1 w-28 overflow-hidden rounded-full bg-slate-700/80">
          <div
            className={cn(
              "h-full rounded-full bg-gradient-to-r from-blue-600 via-sky-400 to-blue-600",
              motionOff ? "w-full" : "animate-[d4SplashBar_1.4s_ease-in-out_infinite]",
            )}
            style={{ width: motionOff ? "100%" : "40%" }}
          />
        </div>
      </div>

      <style>{`
        @keyframes d4SplashSpin { to { transform: rotate(360deg); } }
        @keyframes d4SplashPulse {
          0%, 100% { opacity: 0.35; transform: scale(0.92); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }
        @keyframes d4SplashGlow {
          0%, 100% { opacity: 0.75; }
          50% { opacity: 1; }
        }
        @keyframes d4SplashLogoIn {
          from { opacity: 0; transform: scale(0.88); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes d4SplashTextIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes d4SplashWord {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes d4SplashParticle {
          0%, 100% { transform: translateY(0); opacity: 0.2; }
          50% { transform: translateY(-18px); opacity: 0.75; }
        }
        @keyframes d4SplashWave {
          from { transform: translateX(0); }
          to { transform: translateX(-40px); }
        }
        @keyframes d4SplashBar {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(320%); }
        }
      `}</style>
    </div>
  );
}
