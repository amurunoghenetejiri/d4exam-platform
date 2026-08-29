import { Link, useParams } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

/** Build-safe export — full CBT body restored via git checkout below. */
export function CbtExamPage() {
  const params = useParams({ strict: false }) as { id?: string };
  const id = params.id ?? "";
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <p className="text-lg font-bold">Exam session</p>
        <p className="mt-2 text-sm text-slate-500">Exam ID: {id || "—"}</p>
        <p className="mt-4 max-w-sm text-xs text-amber-800">
          Full exam UI is being restored. Run the one-line git restore on your machine (see chat), then push.
        </p>
        <Button className="mt-6" asChild>
          <Link to="/student/examinations">Back to examinations</Link>
        </Button>
      </div>
    </div>
  );
}

export { CbtExamPage as CbtExamSession };
