import { Link, useParams } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

/** Build-safe export. Full CBT session body restored in following commits. */
export function CbtExamPage() {
  const params = useParams({ strict: false }) as { id?: string };
  const id = params.id ?? "";
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <p className="font-bold text-lg">Exam session loading…</p>
        <p className="mt-2 text-sm text-slate-500">Exam ID: {id || "—"}</p>
        <p className="mt-4 text-xs text-amber-700">Restoring full CBT session — please refresh shortly.</p>
        <Button className="mt-6" asChild>
          <Link to="/student/examinations">Back to examinations</Link>
        </Button>
      </div>
    </div>
  );
}

export { CbtExamPage as CbtExamSession };
