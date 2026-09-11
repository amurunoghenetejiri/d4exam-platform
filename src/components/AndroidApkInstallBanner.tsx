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

const DISMISS_KEY = "d4exam_apk_install_dismiss_v1";

/**
 * Website only, Android phones: prompt to install the real APK (not PWA).
 * Hidden on iOS, desktop, and inside the Capacitor shell.
 */
export function AndroidApkInstallBanner() {
  const [cfg, setCfg] = useState<AppVersionConfig | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isNativeShell()) return;
    if (isIosWebBrowser()) return;
    if (!isAndroidWebBrowser()) return;

    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* ignore */
    }

    let cancelled = false;
    void fetchAppVersionConfig().then((c) => {
      if (cancelled) return;
      setCfg(c);
      setVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible || !cfg) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[2147482000] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4"
      role="region"
      aria-label="Install Android app"
    >
      <div className="mx-auto flex max-w-lg items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl sm:p-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
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
