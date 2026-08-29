import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { ThemeColorSync } from "@/components/ThemeColorSync";
import { OfflineBootstrap } from "@/components/OfflineBootstrap";
import { LocalDbBootstrap } from "@/components/LocalDbBootstrap";
import { OfflineStatusPill } from "@/components/OfflineStatusPill";
import { NotificationLiveListener } from "@/components/NotificationLiveListener";
import { NotificationPermissionPrompt } from "@/components/NotificationPermissionPrompt";
import { useSessionUser } from "@/lib/session";
import { initNativePushIfNeeded } from "@/lib/push";
import { isNativeShell } from "@/native/platform";
import { applyNativeStatusBar } from "@/native/statusBar";
import { registerAndroidBackButton } from "@/native/backButton";
import { AnimatedSplash } from "@/components/splash/AnimatedSplash";

function NativeBootstrap() {
  const { data: session } = useSessionUser();
  useEffect(() => {
    if (!isNativeShell()) return;
    let cancelled = false;
    (async () => {
      try {
        document.documentElement.classList.add("d4-native");
        await applyNativeStatusBar();
        // Do NOT hide SplashScreen here — AnimatedSplash owns hideSplashSafely()
        // so the user never sees blank navy between system splash and branded splash.
        const unsubBack = await registerAndroidBackButton();
        if (cancelled) {
          unsubBack();
          return;
        }
        (window as unknown as { __d4UnsubBack?: () => void }).__d4UnsubBack = unsubBack;
        if (!cancelled) {
          await initNativePushIfNeeded(session?.userId, session?.role);
        }
      } catch (e) {
        console.warn("[D4EXAM] Native bootstrap error", e);
      }
    })();
    return () => {
      cancelled = true;
      try {
        (window as unknown as { __d4UnsubBack?: () => void }).__d4UnsubBack?.();
      } catch {
        /* ignore */
      }
    };
  }, [session?.userId, session?.role]);
  return null;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Don't worry — D4EXAM is still running. You can try again or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try Again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go Home
          </a>
          <button
            type="button"
            onClick={() => {
              try {
                window.location.reload();
              } catch {
                window.location.href = "/";
              }
            }}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Reload App
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover",
      },
      { title: "D4EXAM — Secure Online Examination Platform" },
      {
        name: "description",
        content:
          "D4EXAM is a professional CBT and examination management platform for schools, colleges and universities worldwide.",
      },
      { name: "author", content: "D4EXAM" },
      { name: "theme-color", content: "#f8fafc" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

/**
 * Instant paint for native/PWA cold start: solid theme navy until React mounts
 * AnimatedSplash. Removed as soon as AnimatedSplash is visible.
 * Website browsers: boot splash is never shown (script checks shell).
 */
const BOOT_SPLASH_SCRIPT = `
(function(){
  try {
    var shell = false;
    try {
      var c = window.Capacitor;
      if (c && (c.isNativePlatform && c.isNativePlatform() || c.getPlatform && (c.getPlatform()==='android'||c.getPlatform()==='ios'))) shell = true;
    } catch(e){}
    try {
      var ua = navigator.userAgent || '';
      if (/Android/i.test(ua) && (/; wv\\)/i.test(ua) || /Capacitor/i.test(ua))) shell = true;
    } catch(e){}
    try {
      if (window.matchMedia && (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches)) shell = true;
      if (navigator.standalone === true) shell = true;
    } catch(e){}
    if (!shell) return;
    if (sessionStorage.getItem('d4exam_splash_shown_v5') === '1') return;
    var el = document.getElementById('d4-boot-splash');
    if (el) el.style.display = 'flex';
  } catch(e){}
})();
`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <style
          dangerouslySetInnerHTML={{
            __html: `
#d4-boot-splash{display:none;position:fixed;inset:0;z-index:2147483646;align-items:center;justify-content:center;flex-direction:column;background:#0b1b3a;color:#fff;font-family:system-ui,sans-serif}
#d4-boot-splash img{width:min(40vw,160px);height:min(40vw,160px);object-fit:contain}
#d4-boot-splash .t{margin-top:1.25rem;font-weight:800;letter-spacing:.14em;font-size:clamp(1.5rem,6vw,2.25rem)}
#d4-boot-splash .t span.b{color:#2563eb}
#d4-boot-splash .s{margin-top:.5rem;font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:#94a3b8;font-weight:600}
`,
          }}
        />
      </head>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <div id="d4-boot-splash" aria-hidden="true">
          <img src="/logo.png" alt="" width="160" height="160" />
          <div className="t">
            D<span className="b">4</span>EXAM
          </div>
          <div className="s">Smart Examination System</div>
        </div>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SPLASH_SCRIPT }} />
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function installGlobalErrorHandlers() {
  if (typeof window === "undefined") return;
  const w = window as Window & { __d4GlobalHandlers?: boolean };
  if (w.__d4GlobalHandlers) return;
  w.__d4GlobalHandlers = true;
  window.addEventListener("unhandledrejection", (ev) => {
    console.warn("[D4EXAM] unhandledrejection", ev.reason);
    ev.preventDefault?.();
  });
  window.addEventListener("error", (ev) => {
    console.warn("[D4EXAM] window error", ev.message);
  });
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    installGlobalErrorHandlers();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeColorSync />
      <LocalDbBootstrap />
      <OfflineBootstrap />
      <OfflineStatusPill />
      <NotificationLiveListener />
      <NotificationPermissionPrompt />
      <Outlet />
      <NativeBootstrap />
      <AnimatedSplash />
      <Toaster />
    </QueryClientProvider>
  );
}
