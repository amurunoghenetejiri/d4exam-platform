import { Button } from "@/components/ui/button";

export function SubmitConfirmDialog({
  open,
  answered,
  total,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  answered: number;
  total: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-extrabold text-slate-900">Submit examination?</h2>
        <p className="mt-2 text-sm text-slate-600">
          You have answered <strong>{answered}</strong> of <strong>{total}</strong> questions.
          You cannot change answers after submitting.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" className="font-semibold" onClick={onCancel}>
            Keep writing
          </Button>
          <Button className="font-semibold" onClick={onConfirm}>
            Yes, submit now
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ResumeBanner() {
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm font-semibold text-amber-900">
      You have an exam in progress. Complete the security check and tap Continue examination to resume.
      Your timer has kept running.
    </div>
  );
}

export function MissedExamPanel({
  message,
  windowLabel,
  durationMinutes,
  totalQuestions,
}: {
  message: string;
  windowLabel: string;
  durationMinutes: number;
  totalQuestions: number;
}) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <p className="text-lg font-extrabold text-slate-900">Exam missed</p>
      <p className="mt-2 text-sm text-slate-600">{message}</p>
      <p className="mt-3 text-xs text-slate-500">{windowLabel}</p>
      <p className="mt-1 text-xs text-slate-500">
        Duration: {durationMinutes} minutes · {totalQuestions} questions
      </p>
    </div>
  );
}
