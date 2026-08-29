/**
 * When a student is signed in on the native app, watch upcoming exams and
 * drive ONE ongoing local notification with a live HH:MM:SS countdown.
 * Does not spam new pushes every second.
 */
import { useEffect, useRef } from "react";
import { useSessionUser } from "@/lib/session";
import { isNativeShell } from "@/native/platform";
import { supabase } from "@/integrations/supabase/client";
import {
  startExamCountdownNotification,
  stopAllExamCountdownNotifications,
  bindLocalNotificationActions,
} from "@/native/localNotify";

const HORIZON_MS = 24 * 60 * 60 * 1000; // start countdown UI within 24h
const POLL_MS = 60_000;

export function ExamCountdownBootstrap() {
  const { data: session } = useSessionUser();
  const started = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isNativeShell()) return;
    if (!session?.userId || session.role !== "student") return;

    void bindLocalNotificationActions();

    let cancelled = false;

    const run = async () => {
      if (cancelled) return;
      try {
        // Resolve student name
        let studentName = "Student";
        try {
          const { data: pr } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("auth_user_id", session.userId)
            .maybeSingle();
          studentName = (pr as { full_name?: string } | null)?.full_name?.trim() || "Student";
        } catch {
          /* ignore */
        }

        // School + course enrollments → upcoming exams
        const { data: roles } = await supabase
          .from("user_roles")
          .select("school_id")
          .eq("user_id", session.userId)
          .eq("role", "student")
          .limit(5);
        const schoolIds = [
          ...new Set(
            (roles ?? []).map((r) => (r as { school_id?: string }).school_id).filter(Boolean) as string[],
          ),
        ];
        if (!schoolIds.length) return;

        const now = Date.now();
        const until = new Date(now + HORIZON_MS).toISOString();
        const from = new Date(now - 60_000).toISOString();

        const { data: exams } = await supabase
          .from("examinations")
          .select("id, title, scheduled_start, scheduled_end, status, course_id, courses(code, name)")
          .in("school_id", schoolIds)
          .in("status", ["approved", "scheduled", "published", "ongoing", "active", "open"])
          .not("scheduled_start", "is", null)
          .gte("scheduled_start", from)
          .lte("scheduled_start", until)
          .limit(20);

        for (const raw of exams ?? []) {
          const exam = raw as {
            id: string;
            title?: string;
            scheduled_start?: string;
            scheduled_end?: string | null;
            courses?: { code?: string; name?: string } | null;
          };
          if (!exam.scheduled_start || !exam.id) continue;
          const startMs = new Date(exam.scheduled_start).getTime();
          if (Number.isNaN(startMs) || startMs < now - 30_000) continue;
          if (started.current.has(exam.id)) continue;
          started.current.add(exam.id);

          const code =
            (exam.courses?.code || "").trim() ||
            (exam.title || "Examination").trim();

          startExamCountdownNotification({
            examId: exam.id,
            studentName,
            courseCode: code,
            startIso: exam.scheduled_start,
            endIso: exam.scheduled_end,
            startLink: `/student/exam/${exam.id}`,
            viewLink: `/student/exam/${exam.id}`,
          });
        }
      } catch (e) {
        console.warn("[D4EXAM] ExamCountdownBootstrap", e);
      }
    };

    void run();
    const t = window.setInterval(() => void run(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(t);
      stopAllExamCountdownNotifications();
      started.current.clear();
    };
  }, [session?.userId, session?.role]);

  return null;
}
