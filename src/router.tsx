import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { isOnlineNow } from "@/lib/offline-sync";

function DefaultPending() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="text-sm text-slate-500">Loading page…</p>
    </div>
  );
}

function DefaultError({ error }: { error: Error }) {
  const msg = String(error?.message ?? "").toLowerCase();
  const network =
    !isOnlineNow() ||
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("load failed");

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-500 text-xl font-bold">
        D4
      </div>
      <h1 className="text-lg font-semibold text-slate-900">
        {network ? "You're offline" : "This page didn't load"}
      </h1>
      <p className="text-sm text-slate-500">
        {network
          ? "Connect to the Internet once to download this content. Pages you already opened will work from saved data."
          : "Something went wrong. Try again or go back to your dashboard."}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
        <a
          href="/"
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800"
        >
          Go home
        </a>
      </div>
    </div>
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60_000,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        refetchOnMount: true,
        retry: (failureCount, error) => {
          if (typeof navigator !== "undefined" && !navigator.onLine) return false;
          const m = String((error as Error)?.message ?? "").toLowerCase();
          if (m.includes("failed to fetch") || m.includes("network")) return failureCount < 1;
          return failureCount < 1;
        },
        retryDelay: 400,
        networkMode: "offlineFirst",
        throwOnError: false,
      },
      mutations: {
        retry: 0,
        networkMode: "online",
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 5 * 60_000,
    defaultPreload: "intent",
    defaultPendingMs: 0,
    defaultPendingMinMs: 120,
    defaultPendingComponent: DefaultPending,
    defaultErrorComponent: DefaultError as never,
  });

  return router;
};
