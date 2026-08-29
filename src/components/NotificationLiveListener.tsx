/**
 * Live in-app + native D4EXAM tray (not Chrome) when a notifications row is inserted.
 * Skips spammy countdown tick rows — those are handled by one ongoing local notification.
 */
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/lib/session";
import { isNativeShell } from "@/native/platform";
import { showD4ExamNativeNotification } from "@/native/localNotify";

function isCountdownSpam(row: {
  title?: string;
  message?: string;
  type?: string;
}): boolean {
  const ty = String(row.type || "").toLowerCase();
  const title = String(row.title || "").toLowerCase();
  const msg = String(row.message || "").toLowerCase();
  if (ty.includes("countdown") || ty.includes("exam_countdown")) return true;
  if (title.includes("starts in") || msg.includes("starts in")) return true;
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(msg.trim())) return true;
  return false;
}

export function NotificationLiveListener() {
  const { data: session } = useSessionUser();
  const queryClient = useQueryClient();
  const userId = session?.userId;
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`d4-notif-live-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_user_id=eq.${userId}`,
        },
        (payload) => {
          try {
            const row = payload.new as {
              id?: string;
              title?: string;
              message?: string;
              link?: string | null;
              type?: string;
            };
            if (!row?.id || seen.current.has(row.id)) return;
            seen.current.add(row.id);
            if (seen.current.size > 80) {
              const first = seen.current.values().next().value as string;
              seen.current.delete(first);
            }

            if (isCountdownSpam(row)) {
              void queryClient.invalidateQueries({ queryKey: ["count", "notifications"] });
              void queryClient.invalidateQueries({
                queryKey: ["own-notifications", userId],
              });
              return;
            }

            const title = row.title || "D4EXAM";
            const body = row.message || "";
            toast.info(title, {
              description: body,
              duration: 10_000,
            });
            if (isNativeShell()) {
              void showD4ExamNativeNotification(title, body, row.link);
            }
            void queryClient.invalidateQueries({ queryKey: ["count", "notifications"] });
            void queryClient.invalidateQueries({
              queryKey: ["count", "notifications", "unread", userId],
            });
            void queryClient.invalidateQueries({
              queryKey: ["own-notifications", userId],
            });
            void queryClient.invalidateQueries({ queryKey: ["rows", "notifications"] });
          } catch {
            /* ignore */
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return null;
}
