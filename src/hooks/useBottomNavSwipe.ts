/**
 * Horizontal swipe between bottom-nav tabs with a visible slide transition.
 */
import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { NavItem } from "@/components/navigation/navConfig";

const MIN_DX = 64;
const MAX_DY = 56;
const MAX_MS = 600;
const SLIDE_MS = 280;

function runSlideThen(direction: "left" | "right", onDone: () => void) {
  if (typeof document === "undefined") {
    onDone();
    return;
  }
  const main =
    (document.querySelector(".d4-shell-main-offset main") as HTMLElement | null) ||
    (document.querySelector("main") as HTMLElement | null);
  if (!main) {
    onDone();
    return;
  }

  const from = direction === "left" ? "0" : "0";
  const mid = direction === "left" ? "-28%" : "28%";
  const enterFrom = direction === "left" ? "22%" : "-22%";

  const prevTransition = main.style.transition;
  const prevTransform = main.style.transform;
  const prevOpacity = main.style.opacity;

  main.style.transition = `transform ${SLIDE_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${SLIDE_MS}ms ease`;
  main.style.transform = `translate3d(${mid},0,0)`;
  main.style.opacity = "0.55";

  window.setTimeout(() => {
    onDone();
    // Next frame: incoming page starts offset then settles
    requestAnimationFrame(() => {
      const nextMain =
        (document.querySelector(".d4-shell-main-offset main") as HTMLElement | null) ||
        (document.querySelector("main") as HTMLElement | null);
      if (!nextMain) return;
      nextMain.style.transition = "none";
      nextMain.style.transform = `translate3d(${enterFrom},0,0)`;
      nextMain.style.opacity = "0.7";
      // force reflow
      void nextMain.offsetWidth;
      nextMain.style.transition = `transform ${SLIDE_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${SLIDE_MS}ms ease`;
      nextMain.style.transform = "translate3d(0,0,0)";
      nextMain.style.opacity = "1";
      window.setTimeout(() => {
        nextMain.style.transition = prevTransition;
        nextMain.style.transform = prevTransform;
        nextMain.style.opacity = prevOpacity;
      }, SLIDE_MS + 20);
    });
  }, SLIDE_MS);

  // safety restore if navigation fails
  window.setTimeout(() => {
    try {
      main.style.transition = prevTransition;
      main.style.transform = prevTransform;
      main.style.opacity = prevOpacity;
    } catch {
      /* ignore */
    }
  }, SLIDE_MS * 3);
}

export function useBottomNavSwipe(
  bottomNav: NavItem[] | undefined,
  home: string,
  enabled = true,
) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const animatingRef = useRef(false);

  useEffect(() => {
    if (!enabled || !bottomNav?.length) return;
    if (typeof window === "undefined") return;

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
      if (animatingRef.current) return;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      startRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    };

    const onEnd = (e: TouchEvent) => {
      const start = startRef.current;
      startRef.current = null;
      if (animatingRef.current) return;
      if (!start || e.changedTouches.length !== 1) return;

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

      if (dx < 0 && idx < bottomNav.length - 1) {
        animatingRef.current = true;
        runSlideThen("left", () => {
          void navigate({ to: bottomNav[idx + 1].to as never }).finally(() => {
            window.setTimeout(() => {
              animatingRef.current = false;
            }, SLIDE_MS + 40);
          });
        });
      } else if (dx > 0 && idx > 0) {
        animatingRef.current = true;
        runSlideThen("right", () => {
          void navigate({ to: bottomNav[idx - 1].to as never }).finally(() => {
            window.setTimeout(() => {
              animatingRef.current = false;
            }, SLIDE_MS + 40);
          });
        });
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
