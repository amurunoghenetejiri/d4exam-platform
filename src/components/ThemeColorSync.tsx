import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";

function ensureThemeMeta(): HTMLMetaElement {
  let el = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", "theme-color");
    document.head.appendChild(el);
  }
  return el;
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function parseColor(input: string): string | null {
  const s = (input || "").trim();
  if (!s || s === "transparent") return null;
  if (s.startsWith("#") && (s.length === 7 || s.length === 4)) {
    if (s.length === 4) {
      return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
    }
    return s;
  }
  const m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (m) return rgbToHex(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

/** Sample visible page background and update theme-color (status bar / PWA chrome). */
export function ThemeColorSync() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (typeof document === "undefined") return;

    const apply = () => {
      const candidates: (Element | null)[] = [
        document.querySelector("main"),
        document.querySelector("[data-app-shell]"),
        document.body,
      ];
      let hex: string | null = null;
      for (const el of candidates) {
        if (!el) continue;
        const bg = getComputedStyle(el).backgroundColor;
        hex = parseColor(bg);
        if (hex) break;
      }
      if (!hex) hex = "#f8fafc";
      ensureThemeMeta().setAttribute("content", hex);
    };

    apply();
    const t = window.setTimeout(apply, 80);
    return () => window.clearTimeout(t);
  }, [pathname]);

  return null;
}
