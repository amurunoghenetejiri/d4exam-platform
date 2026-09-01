/**
 * D4EXAM notification copy — exact templates for in-app + push.
 * Dynamic names/course codes only. NEVER include passwords or secrets.
 */

export function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return "";
  }
}

export function fmtTime(iso?: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
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
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export function courseLabel(code?: string | null, title?: string | null): string {
  const c = (code || "").trim();
  const t = (title || "").trim();
  if (c && t && !t.toUpperCase().includes(c.toUpperCase())) return `${c}`;
  if (c) return c;
  if (t) return t;
  return "Examination";
}

// ─── Student ───────────────────────────────────────────────

export function studentExamScheduled(opts: {
  studentName: string;
  courseCode?: string | null;
  examTitle?: string | null;
  start?: string | null;
  end?: string | null;
}): { title: string; message: string } {
  const name = (opts.studentName || "Student").trim();
  const exam = opts.courseCode || opts.examTitle || "Examination";
  const date = fmtDate(opts.start);
  const startT = fmtTime(opts.start);
  const endT = fmtTime(opts.end);
  let message = `🎓 ${name}\nYour ${exam} examination has been scheduled.`;
  if (date) message += `\n\n📅 Date: ${date}`;
  if (startT) message += `\n🕐 Starts: ${startT}`;
  if (endT) message += `\n⏰ Ends: ${endT}`;
  message += `\n\nPlease be prepared before the examination begins.`;
  return { title: `📅 ${name}`, message };
}

export function studentExamCountdown(opts: {
  studentName: string;
  courseCode?: string | null;
  examTitle?: string | null;
  remainingMs: number;
  start?: string | null;
  end?: string | null;
}): { title: string; message: string } {
  const name = (opts.studentName || "Student").trim();
  const exam = opts.courseCode || opts.examTitle || "Examination";
  const cd = formatCountdown(opts.remainingMs);
  const date = fmtDate(opts.start);
  const startT = fmtTime(opts.start);
  const endT = fmtTime(opts.end);
  let message = `⏳ ${name}\nYour ${exam} examination starts in ${cd}.`;
  if (date || startT) {
    message += "\n";
    if (date) message += `\n📅 ${date}`;
    if (startT) message += `\n🕐 ${startT}${endT ? ` – ${endT}` : ""}`;
  }
  message += `\n\nPlease get ready.`;
  return { title: `⏳ ${name} · ${cd}`, message };
}

export function studentExamStartingNow(opts: {
  studentName: string;
  courseCode?: string | null;
  examTitle?: string | null;
}): { title: string; message: string } {
  const name = (opts.studentName || "Student").trim();
  const exam = opts.courseCode || opts.examTitle || "Examination";
  return {
    title: `🚀 ${name}`,
    message: `🚀 ${name}\nYour ${exam} examination is starting now.\n\nYou can enter the examination.`,
  };
}

export function studentExamEnded(opts: {
  studentName: string;
  courseCode?: string | null;
  examTitle?: string | null;
}): { title: string; message: string } {
  const name = (opts.studentName || "Student").trim();
  const exam = opts.courseCode || opts.examTitle || "Examination";
  return {
    title: `🏁 ${name}`,
    message: `🏁 ${name}\nYour ${exam} examination has ended.\n\nThank you for completing your examination.`,
  };
}

export function studentResultReady(opts: {
  studentName: string;
  courseCode?: string | null;
  examTitle?: string | null;
  officerName?: string | null;
}): { title: string; message: string } {
  const name = (opts.studentName || "Student").trim();
  const exam = opts.courseCode || opts.examTitle || "Examination";
  const by = opts.officerName?.trim() ? ` by ${opts.officerName.trim()}` : "";
  return {
    title: `🎉 ${name}`,
    message: `🎉 ${name}\nYour ${exam} examination result has been released${by}.\n\nYour result is now available to view.`,
  };
}

export function studentExamCancelled(opts: {
  studentName: string;
  courseCode?: string | null;
  examTitle?: string | null;
  reason?: string | null;
}): { title: string; message: string } {
  const name = (opts.studentName || "Student").trim();
  const exam = opts.courseCode || opts.examTitle || "Examination";
  const reason = (opts.reason || "No reason provided.").trim();
  return {
    title: `❌ ${name}`,
    message: `❌ ${name}\nYour ${exam} examination has been cancelled.\n\nReason:\n${reason}`,
  };
}

export function studentExamRescheduled(opts: {
  studentName: string;
  courseCode?: string | null;
  examTitle?: string | null;
  start?: string | null;
  end?: string | null;
}): { title: string; message: string } {
  const name = (opts.studentName || "Student").trim();
  const exam = opts.courseCode || opts.examTitle || "Examination";
  const date = fmtDate(opts.start);
  const startT = fmtTime(opts.start);
  const endT = fmtTime(opts.end);
  let message = `📅 ${name}\nYour ${exam} examination has been rescheduled.`;
  if (date) message += `\n\nNew date: ${date}`;
  if (startT) message += `\nNew time: ${startT}${endT ? ` – ${endT}` : ""}`;
  return { title: `📅 ${name}`, message };
}

export function studentExamTerminated(opts: {
  studentName: string;
  courseCode?: string | null;
  examTitle?: string | null;
  reason?: string | null;
}): { title: string; message: string } {
  const name = (opts.studentName || "Student").trim();
  const exam = opts.courseCode || opts.examTitle || "Examination";
  const reason = (opts.reason || "A configured examination security rule was triggered.").trim();
  return {
    title: `🚨 ${name}`,
    message: `🚨 ${name}\nYour ${exam} examination has been terminated.\n\nReason:\n${reason}`,
  };
}

export function studentExamPaused(opts: {
  studentName: string;
  courseCode?: string | null;
  examTitle?: string | null;
  remainingLabel?: string | null;
}): { title: string; message: string } {
  const name = (opts.studentName || "Student").trim();
  const exam = opts.courseCode || opts.examTitle || "Examination";
  const rem = opts.remainingLabel?.trim();
  let message = `⏸️ ${name}\nYour ${exam} examination has been paused.`;
  if (rem) message += `\n\nTime remaining:\n${rem}`;
  message += `\n\nYour examination will resume when the pause period ends.`;
  return { title: `⏸️ ${name}`, message };
}

export function studentExamWarning(opts: {
  studentName: string;
  message: string;
  violationCount?: number | null;
}): { title: string; message: string } {
  const name = (opts.studentName || "Student").trim();
  let body = `⚠️ ${name}\nExamination warning\n\n${(opts.message || "Please follow the examination rules.").trim()}`;
  if (opts.violationCount != null) body += `\n\nViolation count: ${opts.violationCount}`;
  return { title: `⚠️ ${name}`, message: body };
}

export function studentAutoSubmitted(opts: {
  studentName: string;
  courseCode?: string | null;
  examTitle?: string | null;
  reason?: string | null;
}): { title: string; message: string } {
  const name = (opts.studentName || "Student").trim();
  const exam = opts.courseCode || opts.examTitle || "Examination";
  const reason = (opts.reason || "Maximum allowed tab violations were reached.").trim();
  return {
    title: `📤 ${name}`,
    message: `📤 ${name}\nYour ${exam} examination has been automatically submitted.\n\nReason:\n${reason}`,
  };
}

// ─── Teacher ───────────────────────────────────────────────

export function teacherExamApproved(opts: {
  teacherName: string;
  courseCode?: string | null;
  examTitle?: string | null;
  officerName?: string | null;
  start?: string | null;
  end?: string | null;
}): { title: string; message: string } {
  const name = (opts.teacherName || "Teacher").trim();
  const exam = opts.courseCode || opts.examTitle || "Examination";
  const by = opts.officerName?.trim() ? ` by ${opts.officerName.trim()}` : "";
  const date = fmtDate(opts.start);
  const startT = fmtTime(opts.start);
  const endT = fmtTime(opts.end);
  let message = `✅ ${name}\nYour ${exam} examination has been approved${by}.`;
  if (date) message += `\n\n📅 Date: ${date}`;
  if (startT) message += `\n🕐 Time: ${startT}${endT ? ` – ${endT}` : ""}`;
  return { title: `✅ ${name}`, message };
}

export function teacherExamRejected(opts: {
  teacherName: string;
  courseCode?: string | null;
  examTitle?: string | null;
  reason?: string | null;
}): { title: string; message: string } {
  const name = (opts.teacherName || "Teacher").trim();
  const exam = opts.courseCode || opts.examTitle || "Examination";
  const reason = (opts.reason || "No reason provided.").trim();
  return {
    title: `❌ ${name}`,
    message: `❌ ${name}\nYour ${exam} examination was not approved.\n\nReason:\n${reason}`,
  };
}

export function teacherExamRevisionRequested(opts: {
  teacherName: string;
  courseCode?: string | null;
  examTitle?: string | null;
  note?: string | null;
}): { title: string; message: string } {
  const name = (opts.teacherName || "Teacher").trim();
  const exam = opts.courseCode || opts.examTitle || "Examination";
  const note = opts.note?.trim() ? `\n\n${opts.note.trim()}` : "";
  return {
    title: `📝 ${name}`,
    message: `📝 ${name}\nChanges requested for your ${exam} examination.${note}`,
  };
}

export function teacherExamScheduled(opts: {
  teacherName: string;
  courseCode?: string | null;
  examTitle?: string | null;
  start?: string | null;
  end?: string | null;
}): { title: string; message: string } {
  const name = (opts.teacherName || "Teacher").trim();
  const exam = opts.courseCode || opts.examTitle || "Examination";
  const date = fmtDate(opts.start);
  const startT = fmtTime(opts.start);
  const endT = fmtTime(opts.end);
  let message = `📅 ${name}\nYour ${exam} examination has been scheduled.`;
  if (date) message += `\n\n📅 Date: ${date}`;
  if (startT) message += `\n🕐 Time: ${startT}${endT ? ` – ${endT}` : ""}`;
  return { title: `📅 ${name}`, message };
}

export function teacherResultsReady(opts: {
  teacherName: string;
  courseCode?: string | null;
  examTitle?: string | null;
}): { title: string; message: string } {
  const name = (opts.teacherName || "Teacher").trim();
  const exam = opts.courseCode || opts.examTitle || "Examination";
  return {
    title: `📊 ${name}`,
    message: `📊 ${name}\n${exam} examination results are ready for review.`,
  };
}

// ─── Officer ───────────────────────────────────────────────

export function officerExamSubmittedForReview(opts: {
  officerName?: string | null;
  teacherName: string;
  courseCode?: string | null;
  examTitle?: string | null;
}): { title: string; message: string } {
  const officer = (opts.officerName || "Officer").trim();
  const teacher = (opts.teacherName || "A teacher").trim();
  const exam = opts.courseCode || opts.examTitle || "Examination";
  return {
    title: `📝 ${officer}`,
    message: `📝 ${officer}\n${teacher} has submitted ${exam} for approval.\n\nThe examination is ready for review.`,
  };
}

export function officerMonitoringAggregate(opts: {
  courseCode?: string | null;
  examTitle?: string | null;
  entered: number;
  active: number;
  offline: number;
  attention: number;
}): { title: string; message: string } {
  const exam = opts.courseCode || opts.examTitle || "Examination";
  return {
    title: "📊 Examination Activity",
    message: `📊 Examination Activity\n${opts.entered} students have entered the ${exam} examination.\n\n🟢 ${opts.active} currently active\n⚪ ${opts.offline} offline\n⚠️ ${opts.attention} require attention\n\nTap to open live monitoring.`,
  };
}

export function officerViolationAggregate(opts: {
  courseCode?: string | null;
  examTitle?: string | null;
  withViolations: number;
  active: number;
  critical: number;
}): { title: string; message: string } {
  const exam = opts.courseCode || opts.examTitle || "Examination";
  return {
    title: `⚠️ ${exam} Monitoring Alert`,
    message: `⚠️ ${exam} Monitoring Alert\n\n${opts.withViolations} students currently have examination violations requiring attention.\n\n🟢 ${opts.active} active\n⚠️ ${opts.withViolations} with violations\n🔴 ${opts.critical} critical alerts\n\nTap to review.`,
  };
}

// ─── School admin ──────────────────────────────────────────

export function schoolApplicationApproved(opts: {
  schoolName: string;
  applicantName?: string | null;
}): { title: string; message: string } {
  const who = (opts.applicantName || opts.schoolName || "Applicant").trim();
  const school = (opts.schoolName || "Your school").trim();
  return {
    title: `🎉 ${who}`,
    message: `🎉 ${who}\nYour school application has been approved!\n\nYour school has been successfully registered on D4EXAM.\n\nYour School ID and account information are now available.`,
  };
}

export function schoolApplicationRejected(opts: {
  schoolName: string;
  reason?: string | null;
}): { title: string; message: string } {
  const school = (opts.schoolName || "Your school").trim();
  const reason = (opts.reason || "Your application was not approved.").trim();
  return {
    title: `❌ ${school}`,
    message: `❌ ${school}\nYour school application was not approved.\n\nReason:\n${reason}`,
  };
}

export function schoolApplicationReceived(opts: { schoolName: string }): { title: string; message: string } {
  return {
    title: "🏫 School Application Submitted",
    message: `🏫 Your D4EXAM school application for ${opts.schoolName} has been successfully submitted and is now awaiting review.\n\nWe'll notify you when your application status changes.`,
  };
}

export function weeklyEnrollmentUpdate(opts: {
  schoolName: string;
  students: number;
}): { title: string; message: string } {
  return {
    title: "📊 Weekly Enrollment Update",
    message: `📊 Weekly Enrollment Update\n\n${opts.students} students were added this week for ${opts.schoolName}.\n\nTap to view your student list.`,
  };
}

// ─── Super admin ───────────────────────────────────────────

export function newSchoolApplication(opts: {
  schoolName: string;
  applicantName?: string | null;
}): { title: string; message: string } {
  const school = (opts.schoolName || "A school").trim();
  const applicant = opts.applicantName?.trim();
  let message = `🏫 Super Admin\nA new school application has been received.\n\nSchool:\n${school}`;
  if (applicant) message += `\n\nApplicant:\n${applicant}`;
  message += `\n\nThe application is ready for review.`;
  return { title: "🏫 Super Admin", message };
}

export function weeklyPlatformSummary(opts: {
  schools: number;
  students: number;
  teachers: number;
  officers: number;
  examinations: number;
}): { title: string; message: string } {
  return {
    title: "📊 Weekly Platform Summary",
    message: `📊 Weekly Platform Summary\n\n🏫 Schools: ${opts.schools}\n🎓 Students enrolled: ${opts.students}\n👨‍🏫 Teachers: ${opts.teachers}\n🧑‍💼 Officers: ${opts.officers}\n📝 Examinations conducted: ${opts.examinations}`,
  };
}

// ─── Permission / enable confirmation ──────────────────────

export function notificationsEnabledConfirm(): { title: string; message: string } {
  return {
    title: "🔔 D4EXAM Notifications Enabled",
    message:
      "🔔 D4EXAM Notifications Enabled\nYou are all set!\n\nYou will now receive important D4EXAM updates, examination reminders, results, security alerts, and other relevant notifications.",
  };
}

// Legacy aliases used by older call sites
export function studentExamApproved(opts: {
  studentName: string;
  examTitle: string;
  start?: string | null;
  end?: string | null;
}): { title: string; message: string } {
  return studentExamScheduled({
    studentName: opts.studentName,
    courseCode: opts.examTitle,
    start: opts.start,
    end: opts.end,
  });
}

export function studentExamAvailable(opts: {
  studentName: string;
  examTitle: string;
}): { title: string; message: string } {
  return studentExamStartingNow({ studentName: opts.studentName, courseCode: opts.examTitle });
}

export function studentExamReminder(opts: {
  studentName: string;
  examTitle: string;
  kind: "24h" | "30m" | "10m" | "start";
}): { title: string; message: string } {
  if (opts.kind === "start") {
    return studentExamStartingNow({ studentName: opts.studentName, courseCode: opts.examTitle });
  }
  const mins = opts.kind === "24h" ? 24 * 60 : opts.kind === "30m" ? 30 : 10;
  return studentExamCountdown({
    studentName: opts.studentName,
    courseCode: opts.examTitle,
    remainingMs: mins * 60_000,
  });
}

export function studentExamSubmitted(opts: {
  studentName: string;
  examTitle: string;
}): { title: string; message: string } {
  const name = (opts.studentName || "Student").trim();
  return {
    title: `🎓 ${name}`,
    message: `🎓 ${name}\nYour ${opts.examTitle} examination has been submitted successfully.`,
  };
}

export function schoolApplicationNeedsChanges(opts: {
  schoolName: string;
  reason?: string | null;
}): { title: string; message: string } {
  const reason = (opts.reason || "Please update your application.").trim();
  return {
    title: "⚠️ Action Required",
    message: `⚠️ Your school application for ${opts.schoolName} requires changes before it can be approved.\n\n${reason}`,
  };
}

export function weeklySchoolReport(opts: {
  schoolName: string;
  students?: number;
  teachers?: number;
  exams?: number;
  resultsReleased?: number;
}): { title: string; message: string } {
  const lines: string[] = [`📊 Weekly summary for ${opts.schoolName}:`];
  if (opts.students) lines.push(`• ${opts.students} students added`);
  if (opts.teachers) lines.push(`• ${opts.teachers} teachers added`);
  if (opts.exams) lines.push(`• ${opts.exams} examinations created`);
  if (opts.resultsReleased) lines.push(`• ${opts.resultsReleased} results released`);
  return { title: "📊 WEEKLY SCHOOL REPORT", message: lines.join("\n") };
}

export function examSecuritySummary(opts: {
  examTitle: string;
  warnings?: number;
  limitReached?: number;
  paused?: number;
  autoSubmitted?: number;
  terminated?: number;
}): { title: string; message: string } {
  const lines: string[] = [`⚠️ During ${opts.examTitle}:`];
  if (opts.warnings) lines.push(`• ${opts.warnings} students triggered warnings`);
  if (opts.limitReached) lines.push(`• ${opts.limitReached} students reached the violation limit`);
  if (opts.paused) lines.push(`• ${opts.paused} exams were paused`);
  if (opts.autoSubmitted) lines.push(`• ${opts.autoSubmitted} exams were auto-submitted`);
  if (opts.terminated) lines.push(`• ${opts.terminated} exams were terminated`);
  return { title: "⚠️ EXAM SECURITY ALERT", message: lines.join("\n") };
}

export function officerResultAwaitingReview(opts: {
  studentName: string;
  examTitle: string;
}): { title: string; message: string } {
  const name = (opts.studentName || "A student").trim();
  return {
    title: "📊 Result Awaiting Review",
    message: `${name} submitted ${opts.examTitle}. Review and release when ready.`,
  };
}
