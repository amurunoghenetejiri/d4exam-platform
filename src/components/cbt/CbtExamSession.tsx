import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

/** Full implementation is being restored to student.exam.$id.tsx */
export function CbtExamPage() {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="max-w-md space-y-3">
        <p className="font-bold text-slate-900">Examination module is updating</p>
        <p className="text-sm text-slate-600">Please refresh in a moment.</p>
        <Button asChild>
          <Link to="/student/examinations">Back to exams</Link>
        </Button>
      </div>
    </div>
  );
}
