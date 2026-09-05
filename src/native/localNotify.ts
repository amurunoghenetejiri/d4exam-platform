/**
 * Native D4EXAM system notifications (app icon — never Chrome).
 *
 * Exam countdown: ONE ongoing notification (stable id per exam). The body text
 * is updated in place so the student sees a live timer — never a new heads-up
 * every second/minute.
 */
import { isNativeShell } from "@/native/platform";
import {
  formatCountdown,
  studentExamCountdown,
  studentExamStartingNow,
} from "@/lib/notify-messages";

let channelReady = false;
let idSeq = Math.floor(Date.now() % 100000);

/** Fixed id range for exam countdown ongoing notifications (stable per exam). */
function countdownNotifId(examId: string): number {
  let h = 0;
  for (let i = 0; i < examId.length; i++) h = (h * 31 + examId.charCodeAt(i)) >>> 0;
  return 400000 + (h % 90000);
}

async function ensureChannel(): Promise<void> {
  if (channelReady) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.createChannel({
      id: "d4exam_default",
      name: "D4EXAM",
      description: "Exams, results and important updates",
      importance: 5,
      visibility: 1,
      sound: "default",
      vibration: true,
      lights: true,
    });
    /**
     * LOW importance (2) = no heads-up banner when the body is updated.
     * User still sees ONE ongoing notification in the shade with a live countdown.
     */
    await LocalNotifications.createChannel({
      id: "d4exam_countdown",
      name: "D4EXAM Exam Countdown",
      description: "Live examination start countdown (single ongoing notification)",
      importance: 2,
      visibility: 1,
      sound: undefined,
      vibration: false,
      lights: false,
    });
    channelReady = true;
  } catch {
    channelReady = true;
  }
}

const ACTION_TYPE_OPEN = "D4EXAM_OPEN";
let actionTypesReady = false;

async function ensureActionTypes(actionLabel?: string | null): Promise<void> {
  if (actionTypesReady) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const label = (actionLabel || "VIEW DETAILS").trim() || "VIEW DETAILS";
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: ACTION_TYPE_OPEN,
          actions: [
            {
              id: "open",
              title: label,
              foreground: true,
            },
          ],
        },
      ],
    });
    actionTypesReady = true;
  } catch {
    actionTypesReady = true;
  }
}

export async function showD4ExamNativeNotification(
  title: string,
  body: string,
  link?: string | null,
  opts?: {
    id?: number;
    channelId?: string;
    ongoing?: boolean;
    silent?: boolean;
    actionLabel?: string | null;
  },
): Promise<boolean> {
  if (!isNativeShell()) return false;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") {
      perm = await LocalNotifications.requestPermissions();
    }
    if (perm.display !== "granted") return false;

    await ensureChannel();
    const actionLabel = (opts?.actionLabel || "").trim();
    if (actionLabel) {
      // Re-register so the button title matches this notification
      actionTypesReady = false;
      await ensureActionTypes(actionLabel);
    } else {
      await ensureActionTypes("VIEW DETAILS");
    }
    const id = opts?.id ?? ((idSeq = (idSeq + 1) % 100000000));
    const isCountdown = opts?.channelId === "d4exam_countdown" || opts?.silent === true;
    const fullBody = body || "";

    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: title || "D4EXAM",
          // Full message — Android shade expands this (big text)
          body: fullBody,
          largeBody: fullBody,
          summaryText: title || "D4EXAM",
          channelId: opts?.channelId || "d4exam_default",
          smallIcon: "ic_stat_d4exam",
          largeIcon: "ic_launcher",
          iconColor: "#0b1b3a",
          sound: isCountdown ? undefined : "default",
          ongoing: opts?.ongoing === true,
          autoCancel: opts?.ongoing === true ? false : true,
          actionTypeId: isCountdown ? undefined : ACTION_TYPE_OPEN,
          extra: {
            ...(link ? { link } : {}),
            fullBody,
            fullTitle: title || "D4EXAM",
            actionLabel: actionLabel || "VIEW DETAILS",
          },
        },
      ],
    });
    return true;
  } catch (e) {
    console.warn("[D4EXAM] local notification failed", e);
    return false;
  }
}

const countdownTimers = new Map<string, ReturnType<typeof setTimeout>>();

export type ExamCountdownOpts = {
  examId: string;
  studentName: string;
  courseCode: string;
  startIso: string;
  endIso?: string | null;
  startLink?: string;
  viewLink?: string;
};

/**
 * ONE ongoing notification that updates the same id until exam start.
 * Never spams a new notification every second — only refreshes the body text.
 */
export function startExamCountdownNotification(opts: ExamCountdownOpts): void {
  if (typeof window === "undefined") return;
  if (!isNativeShell()) return;

  const key = opts.examId;
  stopExamCountdownNotification(key);

  const notifId = countdownNotifId(opts.examId);
  const startMs = new Date(opts.startIso).getTime();
  if (Number.isNaN(startMs)) return;

  let lastPhase: "countdown" | "start" | null = null;
  let lastShownSec = -1;

  const tick = async () => {
    const remaining = startMs - Date.now();
    if (remaining > 0) {
      const sec = Math.ceil(remaining / 1000);
      if (sec === lastShownSec && lastPhase === "countdown") return;
      lastShownSec = sec;

      const copy = studentExamCountdown({
        studentName: opts.studentName,
        courseCode: opts.courseCode,
        remainingMs: remaining,
        start: opts.startIso,
        end: opts.endIso,
      });
      lastPhase = "countdown";
      await showD4ExamNativeNotification(
        copy.title,
        copy.message,
        opts.viewLink || `/student/exam/${opts.examId}`,
        {
          id: notifId,
          channelId: "d4exam_countdown",
          ongoing: true,
          silent: true,
        },
      );
    } else {
      if (lastPhase !== "start") {
        const copy = studentExamStartingNow({
          studentName: opts.studentName,
          courseCode: opts.courseCode,
        });
        lastPhase = "start";
        await showD4ExamNativeNotification(
          copy.title,
          copy.message,
          opts.startLink || `/student/exam/${opts.examId}`,
          { id: notifId, channelId: "d4exam_default", ongoing: false },
        );
      }
      stopExamCountdownNotification(key);
    }
  };

  void tick();

  const scheduleNext = () => {
    const rem = startMs - Date.now();
    let delay = 30_000;
    if (rem <= 30_000) delay = 1_000;
    else if (rem <= 120_000) delay = 5_000;
    else if (rem <= 600_000) delay = 15_000;
    const handle = setTimeout(() => {
      void tick().finally(() => {
        if (countdownTimers.has(key)) scheduleNext();
      });
    }, delay);
    countdownTimers.set(key, handle);
  };
  scheduleNext();
}

export function stopExamCountdownNotification(examId: string): void {
  const t = countdownTimers.get(examId);
  if (t) {
    clearTimeout(t);
    countdownTimers.delete(examId);
  }
}

export function stopAllExamCountdownNotifications(): void {
  for (const id of [...countdownTimers.keys()]) stopExamCountdownNotification(id);
}

let actionBound = false;
export async function bindLocalNotificationActions(): Promise<void> {
  if (!isNativeShell() || actionBound) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
      try {
        const extra = event.notification?.extra as {
          link?: string;
          fullBody?: string;
          fullTitle?: string;
          actionLabel?: string;
        } | undefined;
        let link = (extra?.link || "").trim();
        if (!link) link = "/student/notifications";
        // Normalize to same-origin path so SPA routing always hits a real route
        if (link.startsWith("http")) {
          try {
            const u = new URL(link);
            link = u.pathname + (u.search || "");
          } catch { /* keep */ }
        }
        if (!link.startsWith("/")) link = `/${link}`;
        // Prefer known student destinations (avoid broken /student/exam deep links)
        if (link.startsWith("/student/exam/") || link === "/student/exam") {
          link = "/student/examinations";
        }
        if (link.startsWith("/student/results/")) {
          link = "/student/results";
        }
        if (typeof window !== "undefined") {
          const origin = window.location.origin || "";
          window.location.assign(origin ? `${origin}${link}` : link);
        }
      } catch {
        /* ignore */
      }
    });
    actionBound = true;
  } catch {
    /* ignore */
  }
}

export { formatCountdown, countdownNotifId };
