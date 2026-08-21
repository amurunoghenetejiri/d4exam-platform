import { Link } from "@tanstack/react-router";

/** Soft recovery UI when an officer child page throws during render. */
export function OfficerPageBoundary({
  title,
  error,
  reset,
}: {
  title: string;
  error: Error;
  reset: () => void;
}) {
  console.error(`[officer/${title}]`, error);
  return (
    <div className="mx-auto flex min-h-[40vh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-base font-bold text-slate-900">{title} could not load</p>
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
          to="/officer/approvals"
          className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800"
        >
          Approvals
        </Link>
      </div>
    </div>
  );
}
