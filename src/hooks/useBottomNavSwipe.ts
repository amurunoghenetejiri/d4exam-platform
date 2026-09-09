/**
 * Horizontal swipe between bottom-nav tabs — app-like behaviour on mobile.
 * Does not run on desktop (lg+) and ignores vertical scrolls / short gestures.
 */
import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { NavItem } from "@/components/navigation/navConfig";

const MIN_DX = 72;
const MAX_DY = 56;
const MAX_MS = 520;

export function useBottomNavSwipe(
  bottomNav: NavItem[] | undefined,
  home: string,
  enabled = true,
) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);

  useEffect(() => {
    if (!enabled || !bottomNav?.length) return;
    if (typeof window === "undefined") return;

    // Only on phone / tablet width (bottom nav is lg:hidden)
    const mq = window.matchMedia("(max-width: 1023px)");
    if (!mq.matches) return;

    const indexOfPath = () => {
      for (let i = 0; i < bottomNav.length; i++) {
        const item = bottomNav[i];
        if (item.to === home) {
          if (pathname === item.to || pathname === `${item.to}/`) return i;
        } else if (pathname === item.to || pathname.startsWith(`${item.to}/`)) {
          return i;
        }
      }
      return -1;
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      startRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    };

    const onEnd = (e: TouchEvent) => {
      const start = startRef.current;
      startRef.current = null;
      if (!start || e.changedTouches.length !== 1) return;

      // Ignore if user is interacting with inputs / horizontal scroll areas
      const target = e.target as HTMLElement | null;
      if (target) {
        if (target.closest("input, textarea, select, [data-no-swipe], [role='slider']")) return;
        if (target.closest("[data-swipe-ignore]")) return;
      }

      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      const dt = Date.now() - start.t;
      if (dt > MAX_MS) return;
      if (Math.abs(dx) < MIN_DX) return;
      if (Math.abs(dy) > MAX_DY) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.2) return;

      const idx = indexOfPath();
      if (idx < 0) return;

      // Swipe left → next tab; swipe right → previous tab
      if (dx < 0 && idx < bottomNav.length - 1) {
        void navigate({ to: bottomNav[idx + 1].to as never });
      } else if (dx > 0 && idx > 0) {
        void navigate({ to: bottomNav[idx - 1].to as never });
      }
    };

    const opts: AddEventListenerOptions = { passive: true };
    document.addEventListener("touchstart", onStart, opts);
    document.addEventListener("touchend", onEnd, opts);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
    };
  }, [bottomNav, enabled, home, navigate, pathname]);
}
