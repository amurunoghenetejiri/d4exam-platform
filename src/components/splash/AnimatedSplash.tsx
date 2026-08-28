import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { hideSplashSafely } from "@/native/statusBar";

/** Minimum time the branded splash stays on screen (ms). */
const SPLASH_MIN_MS = 9000;
/** Absolute safety cap so splash never blocks forever. */
const SPLASH_MAX_MS = 45000;
/** Marks splash already dismissed for this app process / tab session. */
const SESSION_KEY = "d4exam_splash_shown_v5";

/**
 * Splash is ONLY for:
 * - Capacitor Android/iOS native shell
 * - Installed PWA (Add to Home Screen / standalone)
 *
 * Never on the regular website browser, and never again after
 * in-app navigation within the same session.
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
    const ua = navigator.userAgent || "";
    // Capacitor Android WebView heuristic (works even if bridge is late)
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

/**
 * Live animated D4EXAM splash (native app + installed PWA only).
 * Matches the official branded reference: shield logo, D4EXAM title,
 * SMART / SECURE / SEAMLESS, wave, loading bar.
 * - Background = app theme navy (#0b1b3a)
 * - Minimum 9s on cold open, stays until app ready (max 45s)
 * - Responsive: larger on laptop / tablet
 * - Offline-safe (bundled /logo.png)
 */
export function AnimatedSplash({ force = false }: { force?: boolean }) {
  const startRef = useRef<number>(
    typeof performance !== "undefined" ? performance.now() : Date.now(),
  );
  // IMPORTANT: do NOT mark session in the initializer (React remount would hide splash).
  // Only mark when the splash is actually dismissed.
  const [visible, setVisible] = useState(() => {
    if (force) return true;
    if (typeof window === "undefined") return false;
    if (wasSplashShownThisSession()) return false;
    return isAppShellContext();
  });
  const [exiting, setExiting] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const dismissedRef = useRef(false);

  // Re-check shell context shortly after mount (Capacitor bridge can appear slightly late)
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
    const t3 = window.setTimeout(tryShow, 1200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [force, visible]);

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.matchMedia) {
        setReduceMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Hide native solid splash as soon as branded layer is up
  useEffect(() => {
    if (!visible) return;
    void hideSplashSafely();
    const t1 = window.setTimeout(() => void hideSplashSafely(), 200);
    const t2 = window.setTimeout(() => void hideSplashSafely(), 800);
    const t3 = window.setTimeout(() => void hideSplashSafely(), 1600);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [visible]);

  // Track when the app document / shell is ready
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
      {/* Soft center glow — theme navy base */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          !motionOff && "animate-[d4SplashGlow_3.2s_ease-in-out_infinite]",
        )}
        style={{
          background:
            "radial-gradient(ellipse 55% 40% at 50% 28%, rgba(37,99,235,0.38) 0%, rgba(11,27,58,0) 68%)",
        }}
      />

      {/* Particles */}
      {!motionOff && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {Array.from({ length: 16 }).map((_, i) => (
            <span
              key={i}
              className="absolute h-1 w-1 rounded-full bg-sky-300/70 animate-[d4SplashParticle_6s_ease-in-out_infinite]"
              style={{
                left: `${6 + ((i * 19) % 88)}%`,
                top: `${10 + ((i * 23) % 72)}%`,
                animationDelay: `${(i % 7) * 0.35}s`,
                opacity: 0.3 + (i % 5) * 0.1,
              }}
            />
          ))}
        </div>
      )}

      {/* Main brand block — scales up on tablet/laptop */}
      <div className="relative z-10 flex w-full max-w-[min(100%,520px)] flex-col items-center px-5 pt-[6vh] sm:max-w-[560px] sm:px-8 md:max-w-[640px] lg:max-w-[720px]">
        <div
          className={cn(
            "relative grid place-items-center",
            !motionOff && "animate-[d4SplashLogoIn_0.75s_cubic-bezier(0.22,1,0.36,1)_both]",
          )}
        >
          {/* Rotating rings */}
          {!motionOff && (
            <>
              <span
                className="absolute h-[min(56vw,220px)] w-[min(56vw,220px)] rounded-full border border-sky-400/25 sm:h-[240px] sm:w-[240px] md:h-[280px] md:w-[280px] animate-[d4SplashSpin_18s_linear_infinite]"
                aria-hidden
              />
              <span
                className="absolute h-[min(70vw,280px)] w-[min(70vw,280px)] rounded-full border border-blue-400/15 sm:h-[300px] sm:w-[300px] md:h-[340px] md:w-[340px] animate-[d4SplashSpin_28s_linear_infinite_reverse]"
                aria-hidden
              />
              <span
                className="absolute h-[min(44vw,170px)] w-[min(44vw,170px)] rounded-full border border-cyan-300/20 sm:h-[190px] sm:w-[190px] md:h-[220px] md:w-[220px] animate-[d4SplashSpin_12s_linear_infinite]"
                style={{ borderStyle: "dashed" }}
                aria-hidden
              />
            </>
          )}

          <div
            className={cn(
              "absolute h-[min(40vw,160px)] w-[min(40vw,160px)] rounded-full bg-blue-500/25 blur-2xl sm:h-[180px] sm:w-[180px] md:h-[210px] md:w-[210px]",
              !motionOff && "animate-[d4SplashPulse_2.8s_ease-in-out_infinite]",
            )}
            aria-hidden
          />

          {/* Official shield logo (bundled) */}
          <img
            src="/logo.png"
            alt="D4EXAM"
            className="relative z-10 h-[min(40vw,160px)] w-[min(40vw,160px)] object-contain drop-shadow-[0_10px_32px_rgba(37,99,235,0.5)] sm:h-[180px] sm:w-[180px] md:h-[210px] md:w-[210px] lg:h-[240px] lg:w-[240px]"
            draggable={false}
            decoding="async"
          />
        </div>

        {/* Title block matching reference */}
        <div
          className={cn(
            "mt-6 text-center sm:mt-8",
            !motionOff && "animate-[d4SplashTextIn_0.65s_0.3s_cubic-bezier(0.22,1,0.36,1)_both]",
          )}
        >
          <h1 className="text-[clamp(1.85rem,7.5vw,3rem)] font-extrabold tracking-[0.14em] sm:tracking-[0.16em]">
            <span className="text-white">D</span>
            <span className="text-[#2563eb]">4</span>
            <span className="text-white">EXAM</span>
          </h1>
          <p className="mt-2 text-[clamp(9px,2.4vw,13px)] font-semibold uppercase tracking-[0.32em] text-slate-300/95">
            Smart Examination System
          </p>
        </div>

        {/* Feature row: SMART / SECURE / SEAMLESS with icons */}
        <div
          className={cn(
            "mt-8 flex w-full max-w-md items-start justify-center gap-5 sm:mt-10 sm:gap-10 md:gap-14",
            !motionOff && "animate-[d4SplashTextIn_0.55s_0.5s_cubic-bezier(0.22,1,0.36,1)_both]",
          )}
        >
          {(
            [
              {
                label: "SMART.",
                delay: "0.55s",
                icon: (
                  <svg viewBox="0 0 24 24" className="h-6 w-6 sm:h-7 sm:w-7" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                    <path d="M12 3a5.5 5.5 0 0 1 5.5 5.5c0 2.2-1.3 4.1-3.2 5v1.2H9.7V13.5A5.5 5.5 0 0 1 12 3Z" />
                    <path d="M9.5 16.5h5M10 19h4" strokeLinecap="round" />
                  </svg>
                ),
              },
              {
                label: "SECURE.",
                delay: "0.75s",
                icon: (
                  <svg viewBox="0 0 24 24" className="h-6 w-6 sm:h-7 sm:w-7" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
                  </svg>
                ),
              },
              {
                label: "SEAMLESS.",
                delay: "0.95s",
                icon: (
                  <svg viewBox="0 0 24 24" className="h-6 w-6 sm:h-7 sm:w-7" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                    <path d="M7 17a4 4 0 1 1 1.2-7.8A5.5 5.5 0 0 1 18.5 12 3.5 3.5 0 0 1 17 18.5H7.5" strokeLinecap="round" />
                  </svg>
                ),
              },
            ] as const
          ).map((item, idx) => (
            <div
              key={item.label}
              className={cn(
                "flex flex-1 flex-col items-center gap-2 text-sky-300/90",
                !motionOff && "animate-[d4SplashWord_0.5s_cubic-bezier(0.22,1,0.36,1)_both]",
                idx > 0 && "border-l border-slate-600/50 pl-5 sm:pl-10",
              )}
              style={!motionOff ? { animationDelay: item.delay } : undefined}
            >
              {item.icon}
              <span className="text-[10px] font-bold tracking-[0.16em] text-slate-200 sm:text-[11px]">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom wave */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[26vh] overflow-hidden sm:h-[22vh]">
        <div
          className={cn(
            "absolute inset-0 opacity-75",
            !motionOff && "animate-[d4SplashWave_10s_linear_infinite]",
          )}
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 80%, rgba(59,130,246,0.4) 0%, transparent 42%), radial-gradient(circle at 82% 90%, rgba(14,165,233,0.28) 0%, transparent 38%), repeating-linear-gradient(90deg, transparent 0 6px, rgba(59,130,246,0.14) 6px 7px)",
            maskImage: "linear-gradient(to top, black 15%, transparent 95%)",
            WebkitMaskImage: "linear-gradient(to top, black 15%, transparent 95%)",
          }}
        />
      </div>

      {/* Footer tagline + loading bar */}
      <div className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-0 right-0 z-20 flex flex-col items-center gap-3 px-8">
        <p className="text-[10px] font-semibold tracking-[0.28em] text-slate-400 sm:text-[11px]">
          SMART. <span className="text-blue-400">SECURE.</span> SEAMLESS.
        </p>
        <div className="h-1 w-28 overflow-hidden rounded-full bg-slate-700/80 sm:w-36">
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
          from { opacity: 0; transform: scale(0.86); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes d4SplashTextIn {
          from { opacity: 0; transform: translateY(12px); }
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
