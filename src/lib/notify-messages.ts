/**
 * Professional notification copy for D4EXAM (in-app + push).
 * Names, courses, dates — matching product messaging guidelines.
 */

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
  return {
    title: `🎓 ${name}, YOUR EXAM IS APPROVED`,
    message,
  };
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
    return {
      title: `📚 ${name}, EXAM TOMORROW`,
      message: `Your ${exam} examination is scheduled for tomorrow. Be prepared.`,
    };
  }
  if (opts.kind === "30m") {
    return {
      title: `⏰ ${name}, EXAM IN 30 MINUTES`,
      message: `Your ${exam} examination starts in 30 minutes. Be ready!`,
    };
  }
  if (opts.kind === "10m") {
    return {
      title: `⏰ ${name}, EXAM IN 10 MINUTES`,
      message: `Your ${exam} examination starts in 10 minutes. Get ready!`,
    };
  }
  return {
    title: `🚀 ${name}, EXAM STARTS NOW`,
    message: `Your ${exam} examination is now available.`,
  };
}

export function studentResultReady(opts: {
  studentName: string;
  examTitle: string;
  officerName?: string | null;
}): { title: string; message: string } {
  const name = (opts.studentName || "Student").trim();
  const by = opts.officerName?.trim()
    ? ` has been released by ${opts.officerName.trim()}.`
    : " has been released.";
  return {
    title: `🎉 ${name}, YOUR RESULT IS READY!`,
    message: `Your ${opts.examTitle} result${by}`,
  };
}

export function studentAutoSubmitted(opts: {
  studentName: string;
  examTitle: string;
}): { title: string; message: string } {
  const name = (opts.studentName || "Student").trim();
  return {
    title: "⚠️ EXAM AUTO-SUBMITTED",
    message: `${name}, your ${opts.examTitle} examination was automatically submitted because the maximum allowed tab violations were reached.`,
  };
}

export function teacherExamApproved(opts: {
  teacherName: string;
  examTitle: string;
  officerName?: string | null;
  start?: string | null;
  end?: string | null;
}): { title: string; message: string } {
  const name = (opts.teacherName || "Teacher").trim();
  const by = opts.officerName?.trim()
    ? ` by ${opts.officerName.trim()}`
    : "";
  let message = `Your ${opts.examTitle} examination has been approved${by}.`;
  const date = fmtDate(opts.start);
  const startT = fmtTime(opts.start);
  const endT = fmtTime(opts.end);
  if (date) message += `\n\n📅 Date: ${date}`;
  if (startT) message += `\n⏰ Start: ${startT}`;
  if (endT) message += `\n⏰ End: ${endT}`;
  return {
    title: `✅ ${name}, YOUR EXAM HAS BEEN APPROVED`,
    message,
  };
}

export function teacherExamRejected(opts: {
  teacherName: string;
  examTitle: string;
  note?: string | null;
}): { title: string; message: string } {
  const name = (opts.teacherName || "Teacher").trim();
  const note = opts.note?.trim() ? ` ${opts.note.trim()}` : "";
  return {
    title: `❌ ${name}, EXAM REJECTED`,
    message: `Your ${opts.examTitle} examination was rejected.${note}`,
  };
}

export function newSchoolApplication(opts: {
  schoolName: string;
  applicantName?: string | null;
  date?: string | null;
}): { title: string; message: string } {
  const when = opts.date || fmtDate(new Date().toISOString());
  const who = opts.applicantName?.trim() ? `\nApplicant: ${opts.applicantName.trim()}` : "";
  return {
    title: "🏫 NEW SCHOOL APPLICATION",
    message: `A new school has submitted an application.\n\nSchool: ${opts.schoolName}${who}\nDate: ${when}`,
  };
}

export function schoolApplicationReceived(opts: {
  schoolName: string;
}): { title: string; message: string } {
  return {
    title: "📨 APPLICATION RECEIVED",
    message: `Your school application for ${opts.schoolName} has been successfully received.\n\nWe will notify you when it is reviewed.`,
  };
}

export function schoolApplicationApproved(opts: {
  schoolName: string;
  schoolId: string;
  loginHint?: string | null;
}): { title: string; message: string } {
  const login =
    opts.loginHint?.trim() ||
    "Sign in with the school admin email you registered. Use your School ID at login when asked.";
  return {
    title: "🎉 APPLICATION APPROVED",
    message: `Your school application has been approved.\n\nSchool: ${opts.schoolName}\nSchool ID: ${opts.schoolId}\n\n${login}`,
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
  return {
    title: "📊 WEEKLY SCHOOL REPORT",
    message: lines.join("\n"),
  };
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
  return {
    title: "⚠️ EXAM SECURITY ALERT",
    message: lines.join("\n"),
  };
}
