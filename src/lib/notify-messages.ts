/**
 * Professional notification copy for D4EXAM (in-app + push).
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

export function studentExamApproved(opts: {
  studentName: string;
  examTitle: string;
  start?: string | null;
  end?: string | null;
}): { title: string; message: string } {
  const name = (opts.studentName || "Student").trim();
  const exam = opts.examTitle || "Examination";
  const date = fmtDate(opts.start);
  const startT = fmtTime(opts.start);
  const endT = fmtTime(opts.end);
  let message = `Your ${exam} examination has been approved.`;
  if (date) message += `\n\n📅 Date: ${date}`;
  if (startT) message += `\n⏰ Starts: ${startT}`;
  if (endT) message += `\n⏱ Ends: ${endT}`;
  return { title: `🎓 ${name}, YOUR EXAM IS APPROVED`, message };
}

export function studentExamAvailable(opts: {
  studentName: string;
  examTitle: string;
}): { title: string; message: string } {
  const name = (opts.studentName || "Student").trim();
  return {
    title: `🚀 ${name}, EXAM AVAILABLE`,
    message: `Your ${opts.examTitle} examination is now available.`,
  };
}

export function studentExamReminder(opts: {
  studentName: string;
  examTitle: string;
  kind: "24h" | "30m" | "10m" | "start";
}): { title: string; message: string } {
  const name = (opts.studentName || "Student").trim();
  const exam = opts.examTitle;
  if (opts.kind === "24h") {
    return { title: `📚 ${name}, EXAM TOMORROW`, message: `Your ${exam} examination is scheduled for tomorrow. Be prepared.` };
  }
  if (opts.kind === "30m") {
    return { title: `⏰ ${name}, EXAM IN 30 MINUTES`, message: `Your ${exam} examination starts in 30 minutes. Be ready!` };
  }
  if (opts.kind === "10m") {
    return { title: `⏰ ${name}, EXAM IN 10 MINUTES`, message: `Your ${exam} examination starts in 10 minutes. Get ready!` };
  }
  return { title: `🚀 ${name}, EXAM STARTS NOW`, message: `Your ${exam} examination is now available.` };
}

export function studentResultReady(opts: {
  studentName: string;
  examTitle: string;
  officerName?: string | null;
}): { title: string; message: string } {
  const name = (opts.studentName || "Student").trim();
  const by = opts.officerName?.trim() ? ` has been released by ${opts.officerName.trim()}.` : " has been released.";
  return { title: `🎉 ${name}, RESULT READY`, message: `Your result for ${opts.examTitle}${by}` };
}

export function studentAutoSubmitted(opts: {
  studentName: string;
  examTitle: string;
}): { title: string; message: string } {
  const name = (opts.studentName || "Student").trim();
  return {
    title: `📤 ${name}, EXAM AUTO-SUBMITTED`,
    message: `Your ${opts.examTitle} examination was automatically submitted.`,
  };
}

export function teacherExamApproved(opts: {
  teacherName: string;
  examTitle: string;
}): { title: string; message: string } {
  const name = (opts.teacherName || "Teacher").trim();
  return {
    title: `✅ ${name}, EXAM APPROVED`,
    message: `Your examination “${opts.examTitle}” was approved.`,
  };
}

export function teacherExamRejected(opts: {
  teacherName: string;
  examTitle: string;
  note?: string | null;
}): { title: string; message: string } {
  const name = (opts.teacherName || "Teacher").trim();
  const note = opts.note?.trim() ? `\n\nReason:\n${opts.note.trim()}` : "";
  return {
    title: `❌ ${name}, EXAM NOT APPROVED`,
    message: `Your examination “${opts.examTitle}” was not approved.${note}`,
  };
}

export function newSchoolApplication(opts: {
  schoolName: string;
  applicantName?: string | null;
}): { title: string; message: string } {
  const who = opts.applicantName?.trim() ? ` by ${opts.applicantName.trim()}` : "";
  return {
    title: "🏫 New School Application",
    message: `A new school application has been submitted for ${opts.schoolName}${who}. Please review the application.`,
  };
}

export function schoolApplicationReceived(opts: { schoolName: string }): { title: string; message: string } {
  return {
    title: "🏫 School Application Submitted",
    message: `Your D4EXAM school application for ${opts.schoolName} has been successfully submitted and is now awaiting review.\n\nWe'll notify you when your application status changes.`,
  };
}

export function schoolApplicationApproved(opts: {
  schoolName: string;
  schoolId: string;
  loginHint?: string | null;
}): { title: string; message: string } {
  const login = opts.loginHint?.trim() || "Sign in at /login with your School ID and email.";
  return {
    title: "🎉 School Application Approved!",
    message: `Congratulations! Your school application has been approved.\n\nSchool: ${opts.schoolName}\nSchool ID: ${opts.schoolId}\n\n${login}`,
  };
}

export function weeklySchoolReport(opts: {
  schoolName: string;
  students?: number;
  teachers?: number;
  examsCreated?: number;
  examsApproved?: number;
  resultsReleased?: number;
}): { title: string; message: string } {
  const lines: string[] = [`${opts.schoolName} this week:`];
  if (opts.students) lines.push(`• ${opts.students} students enrolled`);
  if (opts.teachers) lines.push(`• ${opts.teachers} teachers added`);
  if (opts.examsCreated) lines.push(`• ${opts.examsCreated} examinations created`);
  if (opts.examsApproved) lines.push(`• ${opts.examsApproved} examinations approved`);
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
  const lines: string[] = [`During ${opts.examTitle}:`];
  if (opts.warnings) lines.push(`• ${opts.warnings} students triggered warnings`);
  if (opts.limitReached) lines.push(`• ${opts.limitReached} students reached the violation limit`);
  if (opts.paused) lines.push(`• ${opts.paused} exams were paused`);
  if (opts.autoSubmitted) lines.push(`• ${opts.autoSubmitted} exams were auto-submitted`);
  if (opts.terminated) lines.push(`• ${opts.terminated} exams were terminated`);
  return { title: "⚠️ EXAM SECURITY ALERT", message: lines.join("\n") };
}

export function schoolApplicationRejected(opts: {
  schoolName: string;
  reason?: string | null;
}): { title: string; message: string } {
  const reason = (opts.reason || "Your application was not approved.").trim();
  return {
    title: "❌ School Application Update",
    message: `Your school application for ${opts.schoolName} was not approved.\n\nReason:\n${reason}`,
  };
}

export function schoolApplicationNeedsChanges(opts: {
  schoolName: string;
  reason?: string | null;
}): { title: string; message: string } {
  const reason = (opts.reason || "Please update your application with the requested information.").trim();
  return {
    title: "⚠️ Action Required",
    message: `Your school application for ${opts.schoolName} requires some changes before it can be approved.\n\n${reason}`,
  };
}
