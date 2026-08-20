import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { OfficerLayout } from "@/layouts";
import { requireRole } from "@/lib/guard";

export const Route = createFileRoute("/officer")({
  ssr: false,
  beforeLoad: ({ context }) => requireRole("examination_officer", context.queryClient),
  component: Layout,
  errorComponent: OfficerSoftError,
});

function Layout() {
  return (
    <OfficerLayout>
      <Outlet />
    </OfficerLayout>
  );
}

/** Soft recovery so one page failure never blanks the whole officer portal */
function OfficerSoftError({ error, reset }: { error: Error; reset: () => void }) {
  console.error("[officer route]", error);
  return (
    <OfficerLayout>
      <div className="mx-auto flex min-h-[40vh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-base font-bold text-slate-900">This section could not load</p>
        <p className="text-sm text-slate-500">
          Try again, or open another officer page. Your session is still active.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
          <Link
            to="/officer"
            className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800"
          >
            Officer home
          </Link>
          <Link
            to="/officer/live-monitor"
            className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800"
          >
            Live monitor
          </Link>
          <Link
            to="/officer/results"
            className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800"
          >
            Results
          </Link>
        </div>
      </div>
    </OfficerLayout>
  );
}
