import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function CbtExamPage() {
  return (
    <div className="grid min-h-dvh place-items-center bg-slate-50 p-6">
      <div className="max-w-md rounded-2xl border bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">Exam session temporarily unavailable</h1>
        <p className="mt-2 text-sm text-slate-600">
          A restore is in progress. Please use the examinations list. Department and level filtering is active — you will only see exams for your department and level.
        </p>
        <Button asChild className="mt-4">
          <Link to="/student/examinations">Back to examinations</Link>
        </Button>
      </div>
    </div>
  );
}

export { CbtExamPage as CbtExamSession };
