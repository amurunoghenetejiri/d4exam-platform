/**
 * Sideloaded APK version check + install helpers.
 * Not Play Store — update downloads the APK from apkUrl (site or GitHub Release).
 * Version config is always fetched from production so native shell sees live minVersion.
 */
import { isNativeShell, getRuntimePlatform } from "@/native/platform";

export type AppVersionConfig = {
  minVersion: string;
  latestVersion: string;
  minBuild: number;
  latestBuild: number;
  apkUrl: string;
  forceUpdate: boolean;
  message: string;
  installMessage: string;
};

const PRODUCTION_ORIGIN = "https://d4exam-platform.vercel.app";

const DEFAULT_CONFIG: AppVersionConfig = {
  minVersion: "1.0.0",
  latestVersion: "1.0.0",
  minBuild: 1,
  latestBuild: 1,
  apkUrl: "https://github.com/amurunoghenetejiri/d4exam-platform/releases/download/apk-latest/d4exam.apk",
  forceUpdate: true,
  message: "A new version of D4EXAM is required. Please update to continue.",
  installMessage:
    "Install the D4EXAM Android app for the full exam experience (camera, mic, screen share).",
};

let cachedConfig: { at: number; value: AppVersionConfig } | null = null;
const CACHE_MS = 60_000;

export function parseVersionParts(v: string): number[] {
  return String(v || "0")
    .trim()
    .replace(/^v/i, "")
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map((n) => parseInt(n, 10) || 0);
}

/** Return negative if a < b, 0 if equal, positive if a > b */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersionParts(a);
  const pb = parseVersionParts(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

export async function fetchAppVersionConfig(): Promise<AppVersionConfig> {
  if (cachedConfig && Date.now() - cachedConfig.at < CACHE_MS) {
    return cachedConfig.value;
  }

  const urls = [
    `${PRODUCTION_ORIGIN}/app-version.json?t=${Date.now()}`,
    `/app-version.json?t=${Date.now()}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-store", credentials: "omit" });
      if (!res.ok) continue;
      const data = (await res.json()) as Partial<AppVersionConfig>;
      const value: AppVersionConfig = {
        ...DEFAULT_CONFIG,
        ...data,
        minBuild: Number(data.minBuild ?? DEFAULT_CONFIG.minBuild) || 1,
        latestBuild: Number(data.latestBuild ?? DEFAULT_CONFIG.latestBuild) || 1,
        forceUpdate: data.forceUpdate !== false,
        apkUrl: String(data.apkUrl || DEFAULT_CONFIG.apkUrl),
      };
      cachedConfig = { at: Date.now(), value };
      return value;
    } catch (e) {
      console.warn("[app-update] config fetch failed", url, e);
    }
  }
  return DEFAULT_CONFIG;
}

export type NativeAppInfo = {
  version: string;
  build: string;
};

export async function getNativeAppInfo(): Promise<NativeAppInfo | null> {
  if (typeof window === "undefined") return null;
  if (!isNativeShell()) return null;
  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    return {
      version: String(info.version || "0"),
      build: String(info.build || "0"),
    };
  } catch (e) {
    console.warn("[app-update] App.getInfo failed", e);
    return null;
  }
}

export function needsForceUpdate(
  info: NativeAppInfo,
  cfg: AppVersionConfig,
): boolean {
  const buildNum = parseInt(info.build, 10);
  if (!Number.isNaN(buildNum) && cfg.minBuild > 0 && buildNum < cfg.minBuild) {
    return true;
  }
  if (compareVersions(info.version, cfg.minVersion) < 0) {
    return true;
  }
  return false;
}

export function resolveApkUrl(apkUrl: string): string {
  if (!apkUrl) return DEFAULT_CONFIG.apkUrl;
  if (/^https?:\/\//i.test(apkUrl)) return apkUrl;
  if (typeof window !== "undefined") {
    try {
      return new URL(apkUrl, PRODUCTION_ORIGIN).href;
    } catch {
      /* fall through */
    }
  }
  return apkUrl.startsWith("/") ? `${PRODUCTION_ORIGIN}${apkUrl}` : `${PRODUCTION_ORIGIN}/${apkUrl}`;
}

export function openApkDownload(apkUrl: string) {
  const url = resolveApkUrl(apkUrl);
  try {
    window.location.href = url;
  } catch {
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      /* ignore */
    }
  }
}

/** Mobile Android browser (not Capacitor shell, not iOS). */
export function isAndroidWebBrowser(): boolean {
  if (typeof window === "undefined") return false;
  if (isNativeShell()) return false;
  if (getRuntimePlatform() === "android") return false;
  try {
    const ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod/i.test(ua)) return false;
    if (!/Android/i.test(ua)) return false;
    return true;
  } catch {
    return false;
  }
}

export function isIosWebBrowser(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const ua = navigator.userAgent || "";
    return /iPhone|iPad|iPod/i.test(ua);
  } catch {
    return false;
  }
}
