import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/** Fixed footer for import preview: Cancel (left) · Save (right). */
export function ImportFooter({
  importBusy,
  importSelectedCount,
  onCancel,
  onSave,
}: {
  importBusy: boolean;
  importSelectedCount: number;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="z-20 flex shrink-0 items-center gap-2 border-t border-slate-200 bg-white px-4 py-3 pb-[max(4.5rem,calc(env(safe-area-inset-bottom)+3.5rem))] sm:pb-3">
      <Button
        type="button"
        variant="outline"
        className="h-12 min-w-0 flex-1 font-semibold"
        disabled={importBusy}
        onClick={onCancel}
      >
        Cancel
      </Button>
      <Button
        type="button"
        className="h-12 min-w-0 flex-1 font-semibold"
        disabled={importBusy}
        onClick={() => {
          if (importSelectedCount === 0) {
            toast.error("Select at least one question, or tap Select all");
            return;
          }
          onSave();
        }}
      >
        {importBusy ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <Save className="mr-1.5 h-4 w-4" />
        )}
        Save ({importSelectedCount})
      </Button>
    </div>
  );
}
