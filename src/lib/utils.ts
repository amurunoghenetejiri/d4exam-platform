import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Shorten long person names for dense mobile UI (e.g. "Araye David Ebotimimiracle" → "Araye David E."). */
export function shortDisplayName(name: string | null | undefined, maxLen = 22): string {
  if (!name) return "";
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  if (cleaned.length <= maxLen) return cleaned;
  const parts = cleaned.split(" ");
  if (parts.length === 1) {
    return cleaned.slice(0, Math.max(1, maxLen - 1)) + "…";
  }
  // Keep first two words; abbreviate the rest
  if (parts.length === 2) {
    const [a, b] = parts;
    if ((a + " " + b).length <= maxLen) return `${a} ${b}`;
    if (a.length + 3 <= maxLen) return `${a} ${b[0]}.`;
    return a.slice(0, maxLen - 1) + "…";
  }
  const first = parts[0];
  const second = parts[1];
  const rest = parts.slice(2).map((p) => (p ? `${p[0].toUpperCase()}.` : "")).join(" ");
  let out = `${first} ${second} ${rest}`.trim();
  if (out.length <= maxLen) return out;
  out = `${first} ${second} ${parts[2][0].toUpperCase()}.`;
  if (out.length <= maxLen) return out;
  if (`${first} ${second[0]}.`.length <= maxLen) return `${first} ${second[0]}.`;
  return first.slice(0, maxLen - 1) + "…";
}

/** Short school / org name for top bars. */
export function shortLabel(text: string | null | undefined, maxLen = 18): string {
  if (!text) return "";
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, Math.max(1, maxLen - 1)) + "…";
}
