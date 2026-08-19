import { Link, useParams, useNavigate } from "@tanstack/react-router";
// TEMP - will replace with full file
export function CbtExamPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md text-center">
        <p className="text-lg font-semibold text-slate-900">Loading examination…</p>
        <p className="mt-2 text-sm text-slate-600">Please wait while the CBT session is prepared.</p>
      </div>
    </div>
  );
}
export { CbtExamPage as CbtExamSession };
