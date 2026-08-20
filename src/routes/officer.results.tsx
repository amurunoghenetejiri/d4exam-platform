import { createFileRoute, Link } from "@tanstack/react-router";
import { OfficerResultsPage } from "@/components/officer/OfficerResultsPage";

export const Route = createFileRoute("/officer/results")({
  head: () => ({ meta: [{ title: "Results Release — D4EXAM" }] }),
  component: OfficerResultsPage,
  errorComponent: ResultsSoftError,
});

function ResultsSoftError({ error, reset }: { error: Error; reset: () => void }) {
  console.error("[officer/results]", error);
  return (
    <div className="mx-auto flex min-h-[40vh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-base font-bold text-slate-900">Results page could not load</p>
      <p className="text-sm text-slate-500">You can retry or return to the officer dashboard.</p>
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
      </div>
    </div>
  );
}
