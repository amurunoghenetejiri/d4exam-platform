import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isNativeShell } from "@/native/platform";
import {
  fetchAppVersionConfig,
  getNativeAppInfo,
  needsForceUpdate,
  openApkDownload,
  type AppVersionConfig,
  type NativeAppInfo,
} from "@/lib/app-update";

/**
 * Native Android APK only: if installed build is below minVersion/minBuild,
 * block the UI and offer download of the latest sideloaded APK (not Play Store).
 */
export function AppUpdateGate() {
  const [cfg, setCfg] = useState<AppVersionConfig | null>(null);
  const [info, setInfo] = useState<NativeAppInfo | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isNativeShell()) return;

    let cancelled = false;
    (async () => {
      setChecking(true);
      try {
        const [config, native] = await Promise.all([
          fetchAppVersionConfig(),
          getNativeAppInfo(),
        ]);
        if (cancelled) return;
        setCfg(config);
        setInfo(native);
        if (native && needsForceUpdate(native, config) && config.forceUpdate) {
          setBlocked(true);
        }
      } catch (e) {
        console.warn("[AppUpdateGate]", e);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!blocked || !cfg) return null;

  return (
    <div
      className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-[#0b1b3a]/95 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="d4-update-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Download className="h-7 w-7" aria-hidden />
        </div>
        <h2 id="d4-update-title" className="text-lg font-extrabold text-slate-900">
          Update required
        </h2>
        <p className="mt-2 text-sm text-slate-600">{cfg.message}</p>
        {info && (
          <p className="mt-2 text-xs text-slate-400">
            Installed v{info.version} ({info.build}) · Latest v{cfg.latestVersion} (
            {cfg.latestBuild})
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2">
          <Button
            className="w-full font-semibold"
            onClick={() => openApkDownload(cfg.apkUrl)}
          >
            <Download className="mr-2 h-4 w-4" />
            Update app now
          </Button>
          <Button
            variant="outline"
            className="w-full font-semibold"
            disabled={checking}
            onClick={() => {
              setChecking(true);
              void (async () => {
                try {
                  const [config, native] = await Promise.all([
                    fetchAppVersionConfig(),
                    getNativeAppInfo(),
                  ]);
                  setCfg(config);
                  setInfo(native);
                  if (!native || !needsForceUpdate(native, config) || !config.forceUpdate) {
                    setBlocked(false);
                  }
                } finally {
                  setChecking(false);
                }
              })();
            }}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${checking ? "animate-spin" : ""}`} />
            I already updated — check again
          </Button>
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
          Download installs the new APK over this app (same signing key). Not from Play
          Store. Allow install from this source if Android asks.
        </p>
      </div>
    </div>
  );
}
