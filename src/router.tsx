import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Cache aggressively — pages felt multi-minute slow from refetch-everything
        staleTime: 60_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: 1,
        networkMode: "online",
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
    // Was 0 → every navigation treated cache as stale and re-fetched everything
    defaultPreloadStaleTime: 30_000,
    defaultPreload: "intent",
  });

  return router;
};
