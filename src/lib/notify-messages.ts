/**
 * D4EXAM notification copy — exact templates for in-app + push.
 *
 * Dynamic values are supported for:
 * - username / role name
 * - course code / course title / examination title
 * - dates and times
 * - reasons, notes and counts
 *
 * Action buttons are represented by actionLabel + actionLink.
 * The existing notification sender can continue using title/message/link.
 *
 * IMPORTANT:
 * This file only creates the notification content.
 * Your push-sending function must also support/render action buttons.
 * Never include passwords, API keys, tokens or other secrets.
 */

export type NotificationAction = {
  label: string;
  link: string;
};

export type NotificationTemplate = {
  title: string;
  message: string;
  action?: NotificationAction | null;
};

function clean(value?: string | null, fallback = ""): string {
  const v = (value || "").trim();
  return v || fallback;
}

function personName(
  value: string | null | undefined,
  fallback: string,
): string {
  return clean(value, fallback);
}

function examName(
  courseCode?: string | null,
  examTitle?: string | null,
  courseTitle?: string | null,
): string {
  return (
    clean(courseTitle, "") ||
    clean(examTitle, "") ||
    clean(courseCode, "") ||
    "Examination"
  );
}

function examDisplay(
  courseCode?: string | null,
  examTitle?: string | null,
  courseTitle?: string | null,
): string {
  const code = clean(courseCode, "");
  const title = clean(courseTitle || examTitle, "");

  if (code && title && !title.toUpperCase().includes(code.toUpperCase())) {
    return `${code} — ${title}`;
  }

  return code || title || "Examination";
}

function action(
  label: string,
  link?: string | null,
): NotificationAction | null {
  const href = clean(link, "");
  if (!href) return null;

  return {
    label,
    link: href,
  };
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return "";

  try {
    const d = new Date(iso);

    if (Number.isNaN(d.getTime())) return "";

    return d.toLocaleDateString(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export function fmtTime(iso?: string | null): string {
  if (!iso) return "";

  try {
    const d = new Date(iso);

    if (Number.isNaN(d.getTime())) return "";

    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/** HH:MM:SS from remaining milliseconds (clamped >= 0). */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  const pad = (n: number) => String(n).padStart(2, "0");

  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  return `${pad(m)}:${pad(s)}`;
}

export function courseLabel(
  code?: string | null,
  title?: string | null,
): string {
  const c = clean(code, "");
  const t = clean(title, "");

  if (c && t && !t.toUpperCase().includes(c.toUpperCase())) {
    return `${c} — ${t}`;
  }

  if (c) return c;
  if (t) return t;

  return "Examination";
}

// ─────────────────────────────────────────────────────────────
// STUDENT
// ─────────────────────────────────────────────────────────────

export function studentExamScheduled(opts: {
  studentName: string;
  username?: string | null;
  courseCode?: string | null;
  courseTitle?: string | null;
  examTitle?: string | null;
  start?: string | null;
  end?: string | null;
  link?: string | null;
}): NotificationTemplate {
  const name = personName(opts.studentName, "Student");
  const username = clean(opts.username, "");
  const exam = examDisplay(
    opts.courseCode,
    opts.examTitle,
    opts.courseTitle,
  );

  const date = fmtDate(opts.start);
  const startT = fmtTime(opts.start);
  const endT = fmtTime(opts.end);

  let message =
    `🎓 ${name}\n\n` +
    `Your examination has been scheduled successfully.\n\n` +
    `📝 Examination: ${exam}`;

  if (username) {
    message += `\n👤 Username: ${username}`;
  }

  if (date) {
    message += `\n📅 Date: ${date}`;
  }

  if (startT) {
    message += `\n🕐 Starts: ${startT}`;
  }

  if (endT) {
    message += `\n⏰ Ends: ${endT}`;
  }

  message +=
    `\n\nPlease be prepared and log in before the examination begins.` +
    `\n\nGood luck from D4EXAM!`;

  return {
    title: `📅 Examination Scheduled — ${name}`,
    message,
    action: action("VIEW EXAM", opts.link),
  };
}

export function studentExamCountdown(opts: {
  studentName: string;
  username?: string | null;
  courseCode?: string | null;
  courseTitle?: string | null;
  examTitle?: string | null;
  remainingMs: number;
  start?: string | null;
  end?: string | null;
  link?: string | null;
}): NotificationTemplate {
  const name = personName(opts.studentName, "Student");
  const exam = examDisplay(
    opts.courseCode,
    opts.examTitle,
    opts.courseTitle,
  );

  const cd = formatCountdown(opts.remainingMs);
  const date = fmtDate(opts.start);
  const startT = fmtTime(opts.start);
  const endT = fmtTime(opts.end);

  let message =
    `⏳ ${name}\n\n` +
    `Your examination is starting soon.\n\n` +
    `📝 Examination: ${exam}\n` +
    `⏱️ Time remaining: ${cd}`;

  if (date) {
    message += `\n📅 Date: ${date}`;
  }

  if (startT) {
    message += `\n🕐 Starts: ${startT}${endT ? ` – ${endT}` : ""}`;
  }

  message +=
    `\n\nPlease get ready and make sure your device and internet connection are stable.` +
    `\n\nD4EXAM`;

  return {
    title: `⏳ ${name} · ${cd}`,
    message,
    action: action("VIEW EXAM", opts.link),
  };
}

export function studentExamStartingNow(opts: {
  studentName: string;
  username?: string | null;
  courseCode?: string | null;
  courseTitle?: string | null;
  examTitle?: string | null;
  link?: string | null;
}): NotificationTemplate {
  const name = personName(opts.studentName, "Student");
  const exam = examDisplay(
    opts.courseCode,
    opts.examTitle,
    opts.courseTitle,
  );

  return {
    title: `🚀 Examination Starting Now — ${name}`,
    message:
      `🚀 ${name}\n\n` +
      `Your examination is starting now.\n\n` +
      `📝 Examination: ${exam}\n\n` +
      `You can now enter the examination.` +
      `\n\nPlease follow all examination rules and instructions.` +
      `\n\nGood luck!`,
    action: action("START EXAM", opts.link),
  };
}

export function studentExamEnded(opts: {
  studentName: string;
  username?: string | null;
  courseCode?: string | null;
  courseTitle?: string | null;
  examTitle?: string | null;
  link?: string | null;
}): NotificationTemplate {
  const name = personName(opts.studentName, "Student");
  const exam = examDisplay(
    opts.courseCode,
    opts.examTitle,
    opts.courseTitle,
  );

  return {
    title: `🏁 Examination Ended — ${name}`,
    message:
      `🏁 ${name}\n\n` +
      `Your examination has ended.\n\n` +
      `📝 Examination: ${exam}\n\n` +
      `Your submission has been recorded.` +
      `\n\nThank you for completing your examination on D4EXAM.`,
    action: action("VIEW EXAM", opts.link),
  };
}

export function studentResultReady(opts: {
  studentName: string;
  username?: string | null;
  courseCode?: string | null;
  courseTitle?: string | null;
  examTitle?: string | null;
  officerName?: string | null;
  link?: string | null;
}): NotificationTemplate {
  const name = personName(opts.studentName, "Student");
  const username = clean(opts.username, "");
  const exam = examDisplay(
    opts.courseCode,
    opts.examTitle,
    opts.courseTitle,
  );
  const by = clean(opts.officerName, "");

  let message =
    `🎉 ${name}\n\n` +
    `Your examination result has been released.\n\n` +
    `📝 Examination: ${exam}`;

  if (username) {
    message += `\n👤 Username: ${username}`;
  }

  if (by) {
    message += `\n🧑‍💼 Released by: ${by}`;
  }

  message +=
    `\n\nYour result is now available to view.` +
    `\n\nTap below to view your result.`;

  return {
    title: `🎉 Result Released — ${name}`,
    message,
    action: action("VIEW RESULT", opts.link),
  };
}

export function studentExamCancelled(opts: {
  studentName: string;
  username?: string | null;
  courseCode?: string | null;
  courseTitle?: string | null;
  examTitle?: string | null;
  reason?: string | null;
  link?: string | null;
}): NotificationTemplate {
  const name = personName(opts.studentName, "Student");
  const exam = examDisplay(
    opts.courseCode,
    opts.examTitle,
    opts.courseTitle,
  );
  const reason = clean(opts.reason, "No reason was provided.");

  return {
    title: `❌ Examination Cancelled — ${name}`,
    message:
      `❌ ${name}\n\n` +
      `Your examination has been cancelled.\n\n` +
      `📝 Examination: ${exam}\n\n` +
      `Reason:\n${reason}\n\n` +
      `Please check D4EXAM for any further updates.`,
    action: action("VIEW DETAILS", opts.link),
  };
}

export function studentExamRescheduled(opts: {
  studentName: string;
  username?: string | null;
  courseCode?: string | null;
  courseTitle?: string | null;
  examTitle?: string | null;
  start?: string | null;
  end?: string | null;
  link?: string | null;
}): NotificationTemplate {
  const name = personName(opts.studentName, "Student");
  const exam = examDisplay(
    opts.courseCode,
    opts.examTitle,
    opts.courseTitle,
  );

  const date = fmtDate(opts.start);
  const startT = fmtTime(opts.start);
  const endT = fmtTime(opts.end);

  let message =
    `📅 ${name}\n\n` +
    `Your examination schedule has been changed.\n\n` +
    `📝 Examination: ${exam}`;

  if (date) {
    message += `\n📅 New date: ${date}`;
  }

  if (startT) {
    message += `\n🕐 New time: ${startT}${endT ? ` – ${endT}` : ""}`;
  }

  message +=
    `\n\nPlease take note of the new examination schedule.` +
    `\n\nD4EXAM`;

  return {
    title: `📅 Examination Rescheduled — ${name}`,
    message,
    action: action("VIEW SCHEDULE", opts.link),
  };
}

export function studentExamTerminated(opts: {
  studentName: string;
  username?: string | null;
  courseCode?: string | null;
  courseTitle?: string | null;
  examTitle?: string | null;
  reason?: string | null;
  link?: string | null;
}): NotificationTemplate {
  const name = personName(opts.studentName, "Student");
  const exam = examDisplay(
    opts.courseCode,
    opts.examTitle,
    opts.courseTitle,
  );

  const reason = clean(
    opts.reason,
    "A configured examination security rule was triggered.",
  );

  return {
    title: `🚨 Examination Terminated — ${name}`,
    message:
      `🚨 ${name}\n\n` +
      `Your examination has been terminated.\n\n` +
      `📝 Examination: ${exam}\n\n` +
      `Reason:\n${reason}\n\n` +
      `If you believe this was an error, please contact your school or examination officer.`,
    action: action("VIEW DETAILS", opts.link),
  };
}

export function studentExamPaused(opts: {
  studentName: string;
  username?: string | null;
  courseCode?: string | null;
  courseTitle?: string | null;
  examTitle?: string | null;
  remainingLabel?: string | null;
  link?: string | null;
}): NotificationTemplate {
  const name = personName(opts.studentName, "Student");
  const exam = examDisplay(
    opts.courseCode,
    opts.examTitle,
    opts.courseTitle,
  );

  const rem = clean(opts.remainingLabel, "");

  let message =
    `⏸️ ${name}\n\n` +
    `Your examination has been temporarily paused.\n\n` +
    `📝 Examination: ${exam}`;

  if (rem) {
    message += `\n⏱️ Time remaining: ${rem}`;
  }

  message +=
    `\n\nYour examination will resume when the pause period ends.` +
    `\n\nPlease remain ready to continue.`;

  return {
    title: `⏸️ Examination Paused — ${name}`,
    message,
    action: action("VIEW EXAM", opts.link),
  };
}

export function studentExamWarning(opts: {
  studentName: string;
  username?: string | null;
  message: string;
  violationCount?: number | null;
  link?: string | null;
}): NotificationTemplate {
  const name = personName(opts.studentName, "Student");

  let body =
    `⚠️ ${name}\n\n` +
    `Examination Warning\n\n` +
    `${clean(opts.message, "Please follow the examination rules.")}`;

  if (opts.violationCount != null) {
    body += `\n\n⚠️ Violation count: ${opts.violationCount}`;
  }

  body +=
    `\n\nPlease follow all examination rules carefully to avoid further action.`;

  return {
    title: `⚠️ Examination Warning — ${name}`,
    message: body,
    action: action("VIEW EXAM", opts.link),
  };
}

export function studentAutoSubmitted(opts: {
  studentName: string;
  username?: string | null;
  courseCode?: string | null;
  courseTitle?: string | null;
  examTitle?: string | null;
  reason?: string | null;
  link?: string | null;
}): NotificationTemplate {
  const name = personName(opts.studentName, "Student");
  const exam = examDisplay(
    opts.courseCode,
    opts.examTitle,
    opts.courseTitle,
  );

  const reason = clean(
    opts.reason,
    "Maximum allowed examination violations were reached.",
  );

  return {
    title: `📤 Exam Auto-Submitted — ${name}`,
    message:
      `📤 ${name}\n\n` +
      `Your examination has been automatically submitted.\n\n` +
      `📝 Examination: ${exam}\n\n` +
      `Reason:\n${reason}\n\n` +
      `Your submission has been recorded on D4EXAM.`,
    action: action("VIEW DETAILS", opts.link),
  };
}

export function studentExamSubmitted(opts: {
  studentName: string;
  username?: string | null;
  courseCode?: string | null;
  courseTitle?: string | null;
  examTitle: string;
  link?: string | null;
}): NotificationTemplate {
  const name = personName(opts.studentName, "Student");
  const exam = examDisplay(
    opts.courseCode,
    opts.examTitle,
    opts.courseTitle,
  );

  return {
    title: `🎓 Exam Submitted — ${name}`,
    message:
      `🎓 ${name}\n\n` +
      `Your examination has been submitted successfully.\n\n` +
      `📝 Examination: ${exam}\n\n` +
      `Your answers have been recorded.` +
      `\n\nYou will be notified when your result is released.`,
    action: action("VIEW EXAM", opts.link),
  };
}

// ─────────────────────────────────────────────────────────────
// TEACHER
// ─────────────────────────────────────────────────────────────

export function teacherExamApproved(opts: {
  teacherName: string;
  username?: string | null;
  courseCode?: string | null;
  courseTitle?: string | null;
  examTitle?: string | null;
  officerName?: string | null;
  start?: string | null;
  end?: string | null;
  link?: string | null;
}): NotificationTemplate {
  const name = personName(opts.teacherName, "Teacher");
  const exam = examDisplay(
    opts.courseCode,
    opts.examTitle,
    opts.courseTitle,
  );
  const by = clean(opts.officerName, "");

  const date = fmtDate(opts.start);
  const startT = fmtTime(opts.start);
  const endT = fmtTime(opts.end);

  let message =
    `✅ ${name}\n\n` +
    `Your examination has been approved successfully.\n\n` +
    `📝 Examination: ${exam}`;

  if (by) {
    message += `\n🧑‍💼 Approved by: ${by}`;
  }

  if (date) {
    message += `\n📅 Date: ${date}`;
  }

  if (startT) {
    message += `\n🕐 Time: ${startT}${endT ? ` – ${endT}` : ""}`;
  }

  message +=
    `\n\nThe examination is now ready according to the approved schedule.`;

  return {
    title: `✅ Exam Approved — ${name}`,
    message,
    action: action("VIEW EXAM", opts.link),
  };
}

export function teacherExamRejected(opts: {
  teacherName: string;
  username?: string | null;
  courseCode?: string | null;
  courseTitle?: string | null;
  examTitle?: string | null;
  reason?: string | null;
  /** @deprecated use reason */
  note?: string | null;
  link?: string | null;
}): NotificationTemplate {
  const name = personName(opts.teacherName, "Teacher");
  const exam = examDisplay(
    opts.courseCode,
    opts.examTitle,
    opts.courseTitle,
  );
  const reason = clean(opts.reason ?? opts.note, "No reason was provided.");

  return {
    title: `❌ Exam Not Approved — ${name}`,
    message:
      `❌ ${name}\n\n` +
      `Your examination was not approved.\n\n` +
      `📝 Examination: ${exam}\n\n` +
      `Reason:\n${reason}\n\n` +
      `Please review the feedback and make the required changes.`,
    action: action("REVIEW EXAM", opts.link),
  };
}

export function teacherExamRevisionRequested(opts: {
  teacherName: string;
  username?: string | null;
  courseCode?: string | null;
  courseTitle?: string | null;
  examTitle?: string | null;
  note?: string | null;
  link?: string | null;
}): NotificationTemplate {
  const name = personName(opts.teacherName, "Teacher");
  const exam = examDisplay(
    opts.courseCode,
    opts.examTitle,
    opts.courseTitle,
  );

  const note = clean(opts.note, "");

  let message =
    `📝 ${name}\n\n` +
    `Changes have been requested for your examination.\n\n` +
    `📝 Examination: ${exam}`;

  if (note) {
    message += `\n\nFeedback:\n${note}`;
  }

  message +=
    `\n\nPlease review the examination and make the requested changes before resubmitting.`;

  return {
    title: `📝 Changes Requested — ${name}`,
    message,
    action: action("EDIT EXAM", opts.link),
  };
}

export function teacherExamScheduled(opts: {
  teacherName: string;
  username?: string | null;
  courseCode?: string | null;
  courseTitle?: string | null;
  examTitle?: string | null;
  start?: string | null;
  end?: string | null;
  link?: string | null;
}): NotificationTemplate {
  const name = personName(opts.teacherName, "Teacher");
  const exam = examDisplay(
    opts.courseCode,
    opts.examTitle,
    opts.courseTitle,
  );

  const date = fmtDate(opts.start);
  const startT = fmtTime(opts.start);
  const endT = fmtTime(opts.end);

  let message =
    `📅 ${name}\n\n` +
    `Your examination has been scheduled.\n\n` +
    `📝 Examination: ${exam}`;

  if (date) {
    message += `\n📅 Date: ${date}`;
  }

  if (startT) {
    message += `\n🕐 Time: ${startT}${endT ? ` – ${endT}` : ""}`;
  }

  message +=
    `\n\nPlease review the schedule and make sure everything is ready before the examination begins.`;

  return {
    title: `📅 Exam Scheduled — ${name}`,
    message,
    action: action("VIEW EXAM", opts.link),
  };
}

export function teacherResultsReady(opts: {
  teacherName: string;
  username?: string | null;
  courseCode?: string | null;
  courseTitle?: string | null;
  examTitle?: string | null;
  link?: string | null;
}): NotificationTemplate {
  const name = personName(opts.teacherName, "Teacher");
  const exam = examDisplay(
    opts.courseCode,
    opts.examTitle,
    opts.courseTitle,
  );

  return {
    title: `📊 Results Ready — ${name}`,
    message:
      `📊 ${name}\n\n` +
      `The examination results are ready for review.\n\n` +
      `📝 Examination: ${exam}\n\n` +
      `Please review the results before they are released to students.`,
    action: action("REVIEW RESULTS", opts.link),
  };
}

// ─────────────────────────────────────────────────────────────
// DEPARTMENTAL OFFICER
// ─────────────────────────────────────────────────────────────

export function officerExamSubmittedForReview(opts: {
  officerName?: string | null;
  username?: string | null;
  teacherName: string;
  teacherUsername?: string | null;
  courseCode?: string | null;
  courseTitle?: string | null;
  examTitle?: string | null;
  link?: string | null;
  /** @deprecated mapped to courseCode when courseCode omitted */
  courseLabel?: string | null;
  schoolName?: string | null;
  schoolCode?: string | null;
}): NotificationTemplate {
  const officer = personName(opts.officerName, "Departmental Officer");
  const teacher = personName(opts.teacherName, "A teacher");

  const exam = examDisplay(
    opts.courseCode ?? opts.courseLabel,
    opts.examTitle,
    opts.courseTitle,
  );

  return {
    title: `📝 Exam Awaiting Approval — ${officer}`,
    message:
      `📝 ${officer}\n\n` +
      `${teacher} has submitted an examination for approval.\n\n` +
      `👨‍🏫 Teacher: ${teacher}\n` +
      `📝 Examination: ${exam}\n\n` +
      `The examination is ready for your review and approval.`,
    action: action("REVIEW EXAM", opts.link),
  };
}

export function officerMonitoringAggregate(opts: {
  officerName?: string | null;
  username?: string | null;
  courseCode?: string | null;
  courseTitle?: string | null;
  examTitle?: string | null;
  entered: number;
  active: number;
  offline: number;
  attention: number;
  link?: string | null;
}): NotificationTemplate {
  const exam = examDisplay(
    opts.courseCode,
    opts.examTitle,
    opts.courseTitle,
  );

  return {
    title: `📊 Live Examination Activity`,
    message:
      `📊 Examination Activity\n\n` +
      `📝 Examination: ${exam}\n\n` +
      `👥 ${opts.entered} students have entered the examination.\n\n` +
      `🟢 ${opts.active} currently active\n` +
      `⚪ ${opts.offline} offline\n` +
      `⚠️ ${opts.attention} require attention\n\n` +
      `Live monitoring is available now.`,
    action: action("OPEN MONITORING", opts.link),
  };
}

export function officerViolationAggregate(opts: {
  officerName?: string | null;
  username?: string | null;
  courseCode?: string | null;
  courseTitle?: string | null;
  examTitle?: string | null;
  withViolations: number;
  active: number;
  critical: number;
  link?: string | null;
}): NotificationTemplate {
  const exam = examDisplay(
    opts.courseCode,
    opts.examTitle,
    opts.courseTitle,
  );

  return {
    title: `⚠️ Monitoring Alert — ${exam}`,
    message:
      `⚠️ Examination Monitoring Alert\n\n` +
      `📝 Examination: ${exam}\n\n` +
      `${opts.withViolations} students currently have examination violations requiring attention.\n\n` +
      `🟢 ${opts.active} active\n` +
      `⚠️ ${opts.withViolations} with violations\n` +
      `🔴 ${opts.critical} critical alerts\n\n` +
      `Please review the monitoring dashboard.`,
    action: action("REVIEW ALERTS", opts.link),
  };
}

export function officerResultAwaitingReview(opts: {
  officerName?: string | null;
  username?: string | null;
  studentName: string;
  studentUsername?: string | null;
  examTitle: string;
  courseCode?: string | null;
  courseTitle?: string | null;
  link?: string | null;
}): NotificationTemplate {
  const officer = personName(opts.officerName, "Departmental Officer");
  const student = personName(opts.studentName, "A student");

  const exam = examDisplay(
    opts.courseCode,
    opts.examTitle,
    opts.courseTitle,
  );

  return {
    title: `📊 Result Awaiting Review`,
    message:
      `📊 ${officer}\n\n` +
      `${student} has submitted an examination and the result is awaiting review.\n\n` +
      `🎓 Student: ${student}\n` +
      `📝 Examination: ${exam}\n\n` +
      `Review the result and release it when ready.`,
    action: action("REVIEW RESULT", opts.link),
  };
}

// ─────────────────────────────────────────────────────────────
// SCHOOL ADMIN
// ─────────────────────────────────────────────────────────────

export function schoolApplicationApproved(opts: {
  schoolName: string;
  applicantName?: string | null;
  username?: string | null;
  link?: string | null;
}): NotificationTemplate {
  const who = personName(
    opts.applicantName,
    opts.schoolName || "Applicant",
  );

  const school = clean(opts.schoolName, "Your school");

  return {
    title: `🎉 Application Approved — ${who}`,
    message:
      `🎉 ${who}\n\n` +
      `Your school application has been approved successfully!\n\n` +
      `🏫 School: ${school}\n\n` +
      `Your school has been successfully registered on D4EXAM.` +
      `\n\nYour School ID and account information are now available.` +
      `\n\nWelcome to D4EXAM!`,
    action: action("OPEN SCHOOL", opts.link),
  };
}

export function schoolApplicationRejected(opts: {
  schoolName: string;
  applicantName?: string | null;
  username?: string | null;
  reason?: string | null;
  link?: string | null;
}): NotificationTemplate {
  const school = clean(opts.schoolName, "Your school");
  const reason = clean(
    opts.reason,
    "Your application was not approved.",
  );

  return {
    title: `❌ Application Not Approved — ${school}`,
    message:
      `❌ ${school}\n\n` +
      `Your school application was not approved.\n\n` +
      `Reason:\n${reason}\n\n` +
      `Please review the reason and follow the instructions provided by the administrator.`,
    action: action("VIEW APPLICATION", opts.link),
  };
}

export function schoolApplicationReceived(opts: {
  schoolName: string;
  applicantName?: string | null;
  username?: string | null;
  link?: string | null;
}): NotificationTemplate {
  const school = clean(opts.schoolName, "your school");

  return {
    title: "🏫 School Application Submitted",
    message:
      `🏫 D4EXAM School Application\n\n` +
      `Your application for ${school} has been successfully submitted.\n\n` +
      `Your application is now awaiting review.` +
      `\n\nWe will notify you when the application status changes.` +
      `\n\nThank you for choosing D4EXAM.`,
    action: action("VIEW APPLICATION", opts.link),
  };
}

export function schoolApplicationNeedsChanges(opts: {
  schoolName: string;
  applicantName?: string | null;
  username?: string | null;
  reason?: string | null;
  link?: string | null;
}): NotificationTemplate {
  const school = clean(opts.schoolName, "your school");
  const reason = clean(
    opts.reason,
    "Please update your application.",
  );

  return {
    title: "⚠️ Action Required",
    message:
      `⚠️ ${school}\n\n` +
      `Your school application requires changes before it can be approved.\n\n` +
      `Required changes:\n${reason}\n\n` +
      `Please update the application and submit it again for review.`,
    action: action("UPDATE APPLICATION", opts.link),
  };
}

export function weeklyEnrollmentUpdate(opts: {
  schoolName: string;
  students: number;
  username?: string | null;
  link?: string | null;
}): NotificationTemplate {
  return {
    title: "📊 Weekly Enrollment Update",
    message:
      `📊 Weekly Enrollment Update\n\n` +
      `🏫 School: ${opts.schoolName}\n\n` +
      `🎓 ${opts.students} students were added this week.\n\n` +
      `Your student records are available in the school dashboard.`,
    action: action("VIEW STUDENTS", opts.link),
  };
}

export function weeklySchoolReport(opts: {
  schoolName: string;
  username?: string | null;
  students?: number;
  teachers?: number;
  exams?: number;
  resultsReleased?: number;
  link?: string | null;
}): NotificationTemplate {
  const lines: string[] = [
    `📊 Weekly School Report`,
    ``,
    `🏫 ${opts.schoolName}`,
    ``,
  ];

  if (opts.students) {
    lines.push(`🎓 ${opts.students} students added`);
  }

  if (opts.teachers) {
    lines.push(`👨‍🏫 ${opts.teachers} teachers added`);
  }

  if (opts.exams) {
    lines.push(`📝 ${opts.exams} examinations created`);
  }

  if (opts.resultsReleased) {
    lines.push(`📊 ${opts.resultsReleased} results released`);
  }

  lines.push(
    ``,
    `Your latest school activity summary is ready to view.`,
  );

  return {
    title: "📊 Weekly School Report",
    message: lines.join("\n"),
    action: action("OPEN DASHBOARD", opts.link),
  };
}

// ─────────────────────────────────────────────────────────────
// SUPER ADMIN
// ─────────────────────────────────────────────────────────────

export function newSchoolApplication(opts: {
  schoolName: string;
  applicantName?: string | null;
  applicantUsername?: string | null;
  link?: string | null;
}): NotificationTemplate {
  const school = clean(opts.schoolName, "A school");
  const applicant = clean(opts.applicantName, "");
  const username = clean(opts.applicantUsername, "");

  let message =
    `🏫 Super Admin\n\n` +
    `A new school application has been received.\n\n` +
    `🏫 School: ${school}`;

  if (applicant) {
    message += `\n👤 Applicant: ${applicant}`;
  }

  if (username) {
    message += `\n🔑 Username: ${username}`;
  }

  message +=
    `\n\nThe application is ready for review.` +
    `\n\nPlease review the application and take the appropriate action.`;

  return {
    title: "🏫 New School Application",
    message,
    action: action("REVIEW APPLICATION", opts.link),
  };
}

export function weeklyPlatformSummary(opts: {
  username?: string | null;
  adminName?: string | null;
  schools: number;
  students: number;
  teachers: number;
  officers: number;
  examinations: number;
  link?: string | null;
}): NotificationTemplate {
  const name = clean(opts.adminName, "Super Admin");

  return {
    title: "📊 Weekly Platform Summary",
    message:
      `📊 ${name}\n\n` +
      `Here is your latest D4EXAM platform summary.\n\n` +
      `🏫 Schools: ${opts.schools}\n` +
      `🎓 Students enrolled: ${opts.students}\n` +
      `👨‍🏫 Teachers: ${opts.teachers}\n` +
      `🧑‍💼 Departmental Officers: ${opts.officers}\n` +
      `📝 Examinations conducted: ${opts.examinations}\n\n` +
      `Tap below to open the administration dashboard.`,
    action: action("OPEN DASHBOARD", opts.link),
  };
}

// ─────────────────────────────────────────────────────────────
// USER / ACCOUNT NOTIFICATIONS
// ─────────────────────────────────────────────────────────────

export function userWelcome(opts: {
  username?: string | null;
  name?: string | null;
  role?: string | null;
  link?: string | null;
}): NotificationTemplate {
  const name = personName(opts.name, "User");
  const username = clean(opts.username, "");
  const role = clean(opts.role, "User");

  let message =
    `🎉 Welcome to D4EXAM, ${name}!\n\n` +
    `Your ${role} account has been successfully created.`;

  if (username) {
    message += `\n\n👤 Username: ${username}`;
  }

  message +=
    `\n\nYou can now access the features available to your account.` +
    `\n\nWelcome to D4EXAM.`;

  return {
    title: `🎉 Welcome, ${name}`,
    message,
    action: action("OPEN DASHBOARD", opts.link),
  };
}

export function newStudentRegistered(opts: {
  studentName: string;
  username?: string | null;
  schoolName?: string | null;
  studentId?: string | null;
  link?: string | null;
}): NotificationTemplate {
  const student = personName(opts.studentName, "Student");
  const username = clean(opts.username, "");
  const school = clean(opts.schoolName, "");
  const studentId = clean(opts.studentId, "");

  let message =
    `🎓 New Student Registered\n\n` +
    `Student: ${student}`;

  if (username) {
    message += `\n👤 Username: ${username}`;
  }

  if (studentId) {
    message += `\n🆔 Student ID: ${studentId}`;
  }

  if (school) {
    message += `\n🏫 School: ${school}`;
  }

  message +=
    `\n\nA new student account has been added to D4EXAM.` +
    `\n\nYou can view the student's profile and records from the dashboard.`;

  return {
    title: `🎓 New Student — ${student}`,
    message,
    action: action("VIEW STUDENT", opts.link),
  };
}

export function newTeacherRegistered(opts: {
  teacherName: string;
  username?: string | null;
  schoolName?: string | null;
  link?: string | null;
}): NotificationTemplate {
  const teacher = personName(opts.teacherName, "Teacher");
  const username = clean(opts.username, "");
  const school = clean(opts.schoolName, "");

  let message =
    `👨‍🏫 New Teacher Registered\n\n` +
    `Teacher: ${teacher}`;

  if (username) {
    message += `\n👤 Username: ${username}`;
  }

  if (school) {
    message += `\n🏫 School: ${school}`;
  }

  message +=
    `\n\nA new teacher account has been added to D4EXAM.` +
    `\n\nReview the account from your dashboard.`;

  return {
    title: `👨‍🏫 New Teacher — ${teacher}`,
    message,
    action: action("VIEW TEACHER", opts.link),
  };
}

export function newUserRegistered(opts: {
  name: string;
  username?: string | null;
  role: string;
  schoolName?: string | null;
  link?: string | null;
}): NotificationTemplate {
  const name = personName(opts.name, "User");
  const role = clean(opts.role, "User");
  const username = clean(opts.username, "");
  const school = clean(opts.schoolName, "");

  let message =
    `👤 New User Registered\n\n` +
    `Name: ${name}\n` +
    `Role: ${role}`;

  if (username) {
    message += `\n👤 Username: ${username}`;
  }

  if (school) {
    message += `\n🏫 School: ${school}`;
  }

  message +=
    `\n\nA new user has been added to the D4EXAM platform.` +
    `\n\nOpen the dashboard to view the account.`;

  return {
    title: `👤 New ${role} — ${name}`,
    message,
    action: action("VIEW USER", opts.link),
  };
}

// ─────────────────────────────────────────────────────────────
// SYSTEM / SECURITY
// ─────────────────────────────────────────────────────────────

export function notificationsEnabledConfirm(opts?: {
  username?: string | null;
  name?: string | null;
  link?: string | null;
}): NotificationTemplate {
  const name = personName(opts?.name, "User");

  return {
    title: "🔔 D4EXAM Notifications Enabled",
    message:
      `🔔 ${name}\n\n` +
      `Your D4EXAM notifications are now enabled!\n\n` +
      `You will receive important updates about examinations, schedules, results, account activity, security alerts and other relevant events.\n\n` +
      `You are all set.`,
    action: action("OPEN NOTIFICATIONS", opts?.link),
  };
}

export function examSecuritySummary(opts: {
  examTitle: string;
  courseCode?: string | null;
  courseTitle?: string | null;
  officerName?: string | null;
  warnings?: number;
  limitReached?: number;
  paused?: number;
  autoSubmitted?: number;
  terminated?: number;
  link?: string | null;
}): NotificationTemplate {
  const exam = examDisplay(
    opts.courseCode,
    opts.examTitle,
    opts.courseTitle,
  );

  const lines: string[] = [
    `⚠️ During ${exam}:`,
  ];

  if (opts.warnings) {
    lines.push(`• ${opts.warnings} students triggered warnings`);
  }

  if (opts.limitReached) {
    lines.push(
      `• ${opts.limitReached} students reached the violation limit`,
    );
  }

  if (opts.paused) {
    lines.push(`• ${opts.paused} examinations were paused`);
  }

  if (opts.autoSubmitted) {
    lines.push(
      `• ${opts.autoSubmitted} examinations were auto-submitted`,
    );
  }

  if (opts.terminated) {
    lines.push(
      `• ${opts.terminated} examinations were terminated`,
    );
  }

  lines.push(
    ``,
    `Please review the examination security report.`,
  );

  return {
    title: "⚠️ Exam Security Alert",
    message: lines.join("\n"),
    action: action("VIEW SECURITY", opts.link),
  };
}

export function systemAlert(opts: {
  username?: string | null;
  name?: string | null;
  title?: string | null;
  message: string;
  link?: string | null;
}): NotificationTemplate {
  const name = personName(opts.name, "User");
  const title = clean(opts.title, "D4EXAM System Alert");

  return {
    title: `⚠️ ${title}`,
    message:
      `⚠️ ${name}\n\n` +
      `${clean(opts.message, "There is an important update from D4EXAM.")}\n\n` +
      `Please check D4EXAM for more information.`,
    action: action("VIEW DETAILS", opts.link),
  };
}

// ─────────────────────────────────────────────────────────────
// GENERIC ROLE NOTIFICATION
// ─────────────────────────────────────────────────────────────

export function roleNotification(opts: {
  name: string;
  username?: string | null;
  role: string;
  title: string;
  message: string;
  link?: string | null;
  actionLabel?: string | null;
}): NotificationTemplate {
  const name = personName(opts.name, "User");
  const role = clean(opts.role, "User");
  const username = clean(opts.username, "");

  let message =
    `${name}\n\n` +
    `${opts.message}`;

  if (username) {
    message += `\n\n👤 Username: ${username}`;
  }

  message += `\n\nD4EXAM • ${role}`;

  return {
    title: `${opts.title} — ${name}`,
    message,
    action: action(
      clean(opts.actionLabel, "VIEW DETAILS"),
      opts.link,
    ),
  };
}

// ─────────────────────────────────────────────────────────────
// LEGACY ALIASES
// ─────────────────────────────────────────────────────────────

export function studentExamApproved(opts: {
  studentName: string;
  username?: string | null;
  examTitle: string;
  courseCode?: string | null;
  courseTitle?: string | null;
  start?: string | null;
  end?: string | null;
  link?: string | null;
}): NotificationTemplate {
  return studentExamScheduled({
    studentName: opts.studentName,
    username: opts.username,
    courseCode: opts.courseCode,
    courseTitle: opts.courseTitle,
    examTitle: opts.examTitle,
    start: opts.start,
    end: opts.end,
    link: opts.link,
  });
}

export function studentExamAvailable(opts: {
  studentName: string;
  username?: string | null;
  examTitle: string;
  courseCode?: string | null;
  courseTitle?: string | null;
  link?: string | null;
}): NotificationTemplate {
  return studentExamStartingNow({
    studentName: opts.studentName,
    username: opts.username,
    courseCode: opts.courseCode,
    courseTitle: opts.courseTitle,
    examTitle: opts.examTitle,
    link: opts.link,
  });
}

export function studentExamReminder(opts: {
  studentName: string;
  username?: string | null;
  examTitle: string;
  courseCode?: string | null;
  courseTitle?: string | null;
  kind: "24h" | "30m" | "10m" | "start";
  link?: string | null;
}): NotificationTemplate {
  if (opts.kind === "start") {
    return studentExamStartingNow({
      studentName: opts.studentName,
      username: opts.username,
      courseCode: opts.courseCode,
      courseTitle: opts.courseTitle,
      examTitle: opts.examTitle,
      link: opts.link,
    });
  }

  const mins =
    opts.kind === "24h"
      ? 24 * 60
      : opts.kind === "30m"
        ? 30
        : 10;

  return studentExamCountdown({
    studentName: opts.studentName,
    username: opts.username,
    courseCode: opts.courseCode,
    courseTitle: opts.courseTitle,
    examTitle: opts.examTitle,
    remainingMs: mins * 60_000,
    link: opts.link,
  });
}
