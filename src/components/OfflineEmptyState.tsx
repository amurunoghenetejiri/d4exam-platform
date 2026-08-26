import { WifiOff } from "lucide-react";
import { OFFLINE_EMPTY_MESSAGE, OFFLINE_USING_SAVED } from "@/lib/offline-query";
import { isOnlineNow } from "@/lib/offline-sync";
import { cn } from "@/lib/utils";

type Props = {
  title?: string;
  message?: string;
  className?: string;
  /** When true, shows “using saved data” tone instead of empty */
  hasSavedData?: boolean;
};

/**
 * Soft empty / offline state — never a technical network error page.
 */
export function OfflineEmptyState({
  title,
  message,
  className,
  hasSavedData = false,
}: Props) {
  const offline = !isOnlineNow();
  const heading = title ?? (hasSavedData ? "Saved data" : "Unavailable offline");
  const body =
    message ??
    (hasSavedData ? OFFLINE_USING_SAVED : offline ? OFFLINE_EMPTY_MESSAGE : "Nothing to show yet.");

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-6 py-12 text-center",
        className,
      )}
      role="status"
    >
      <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-200/80 text-slate-600">
        <WifiOff className="h-5 w-5" aria-hidden />
      </span>
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-semibold text-slate-800">{heading}</p>
        <p className="text-sm text-slate-500">{body}</p>
      </div>
    </div>
  );
}
