/**
 * Native D4EXAM system notifications (app icon — never Chrome).
 * Supports ongoing live exam countdown by updating ONE notification id.
 */
import { isNativeShell } from "@/native/platform";
import { formatCountdown, studentExamCountdown, studentExamStartingNow } from "@/lib/notify-messages";

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
    // Quieter channel for frequent countdown ticks (still visible)
    await LocalNotifications.createChannel({
      id: "d4exam_countdown",
      name: "D4EXAM Exam Countdown",
      description: "Live examination start countdown",
      importance: 4,
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

export async function showD4ExamNativeNotification(
  title: string,
  body: string,
  link?: string | null,
  opts?: { id?: number; channelId?: string; ongoing?: boolean },
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
    const id = opts?.id ?? ((idSeq = (idSeq + 1) % 100000000));
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: title || "D4EXAM",
          body: body || "",
          channelId: opts?.channelId || "d4exam_default",
          smallIcon: "ic_stat_d4exam",
          largeIcon: "ic_launcher",
          iconColor: "#0b1b3a",
          sound: opts?.channelId === "d4exam_countdown" ? undefined : "default",
          extra: link ? { link } : undefined,
        },
      ],
    });
    return true;
  } catch (e) {
    console.warn("[D4EXAM] local notification failed", e);
    return false;
  }
}

const countdownTimers = new Map<string, ReturnType<typeof setInterval>>();

export type ExamCountdownOpts = {
  examId: string;
  studentName: string;
  courseCode: string;
  startIso: string;
  endIso?: string | null;
  /** Deep link when user taps START EXAM */
  startLink?: string;
  viewLink?: string;
};

/**
 * ONE ongoing notification that updates live until exam start.
 * Does NOT send a new push every second — updates the same local notification id.
 * When remaining hits 0 → switches to START EXAM copy.
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

  const tick = async () => {
    const remaining = startMs - Date.now();
    if (remaining > 0) {
      // Update at most every 1s; skip micro-jitter spam when far away
      const copy = studentExamCountdown({
        studentName: opts.studentName,
        courseCode: opts.courseCode,
        remainingMs: remaining,
        start: opts.startIso,
        end: opts.endIso,
      });
      lastPhase = "countdown";
      await showD4ExamNativeNotification(copy.title, copy.message, opts.viewLink || `/student/exam/${opts.examId}`, {
        id: notifId,
        channelId: "d4exam_countdown",
        ongoing: true,
      });
      // Slow down updates when more than 2 minutes away (battery)
      if (remaining > 120_000) {
        // interval is managed below; no-op here
      }
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
          { id: notifId, channelId: "d4exam_default" },
        );
      }
      stopExamCountdownNotification(key);
    }
  };

  void tick();

  // Adaptive interval: 1s under 2 min, else 5s
  const scheduleNext = () => {
    const rem = startMs - Date.now();
    const delay = rem > 120_000 ? 5000 : 1000;
    const handle = setTimeout(() => {
      void tick().finally(() => {
        if (countdownTimers.has(key)) scheduleNext();
      });
    }, delay);
    countdownTimers.set(key, handle as unknown as ReturnType<typeof setInterval>);
  };
  scheduleNext();
}

export function stopExamCountdownNotification(examId: string): void {
  const t = countdownTimers.get(examId);
  if (t) {
    clearTimeout(t as unknown as ReturnType<typeof setTimeout>);
    countdownTimers.delete(examId);
  }
}

export function stopAllExamCountdownNotifications(): void {
  for (const id of [...countdownTimers.keys()]) stopExamCountdownNotification(id);
}

/** Bind notification tap → deep link (once). */
let actionBound = false;
export async function bindLocalNotificationActions(): Promise<void> {
  if (!isNativeShell() || actionBound) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
      try {
        const extra = event.notification?.extra as { link?: string } | undefined;
        const link = extra?.link;
        if (link && typeof window !== "undefined") {
          window.location.assign(link.startsWith("http") ? link : link);
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
