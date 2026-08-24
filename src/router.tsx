import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

function DefaultPending() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="text-sm text-slate-500">Loading page…</p>
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
        retry: 1,
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
  });

  return router;
};
