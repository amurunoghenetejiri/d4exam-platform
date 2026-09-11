import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fetchAppVersionConfig,
  isAndroidWebBrowser,
  isIosWebBrowser,
  openApkDownload,
  type AppVersionConfig,
} from "@/lib/app-update";
import { isNativeShell } from "@/native/platform";

const DISMISS_KEY = "d4exam_apk_install_dismiss_v2";

const FALLBACK_CFG: AppVersionConfig = {
  minVersion: "1.0.0",
  latestVersion: "1.0.0",
  minBuild: 1,
  latestBuild: 1,
  apkUrl:
    "https://github.com/amurunoghenetejiri/d4exam-platform/releases/download/apk-latest/d4exam.apk",
  forceUpdate: true,
  message: "A new version of D4EXAM is required. Please update to continue.",
  installMessage:
    "Install the D4EXAM Android app for the full exam experience (camera, mic, screen share).",
};

function shouldShowInstallPrompt(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get("install") === "1" || q.get("apk") === "1") return true;
  } catch {
    /* ignore */
  }
  // Never inside Capacitor / native WebView
  try {
    const Cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (Cap?.isNativePlatform?.()) return false;
  } catch {
    /* ignore */
  }
  if (isIosWebBrowser()) return false;
  if (isAndroidWebBrowser()) return true;
  // Fallback: Android UA without requiring isAndroidWebBrowser edge cases
  try {
    const ua = navigator.userAgent || "";
    if (/Android/i.test(ua) && !/iPhone|iPad|iPod/i.test(ua)) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Website only, Android phones: prompt to install the real APK (not PWA).
 * Hidden on iOS and inside the Capacitor shell.
 * Tip: open https://d4exam-platform.vercel.app/?install=1 to force-show.
 */
export function AndroidApkInstallBanner() {
  const [cfg, setCfg] = useState<AppVersionConfig>(FALLBACK_CFG);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!shouldShowInstallPrompt()) return;

    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") {
        // still allow forced ?install=1
        const q = new URLSearchParams(window.location.search);
        if (q.get("install") !== "1" && q.get("apk") !== "1") return;
      }
    } catch {
      /* ignore */
    }

    // Show immediately (don't wait for network)
    setVisible(true);

    let cancelled = false;
    void fetchAppVersionConfig().then((c) => {
      if (cancelled) return;
      setCfg(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[2147483645] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4 pointer-events-none"
      role="region"
      aria-label="Install Android app"
    >
      <div className="pointer-events-auto mx-auto flex max-w-lg items-start gap-3 rounded-2xl border-2 border-primary/30 bg-white p-3 shadow-2xl ring-2 ring-primary/20 sm:p-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-white">
          <Download className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-slate-900">Install D4EXAM app</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{cfg.installMessage}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button
              size="sm"
              className="font-semibold"
              onClick={() => openApkDownload(cfg.apkUrl)}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Install app
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="font-semibold text-slate-500"
              onClick={() => {
                setVisible(false);
                try {
                  localStorage.setItem(DISMISS_KEY, "1");
                } catch {
                  /* ignore */
                }
              }}
            >
              Not now
            </Button>
          </div>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Dismiss"
          onClick={() => {
            setVisible(false);
            try {
              localStorage.setItem(DISMISS_KEY, "1");
            } catch {
              /* ignore */
            }
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
