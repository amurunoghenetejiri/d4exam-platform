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
    title: `🎉 ${name}, RESULT READY`,
    message: `Your result for ${opts.examTitle}${by}`,
  };
}

export function teacherExamDecision(opts: {
  teacherName: string;
  examTitle: string;
  decision: "approved" | "rejected" | "revision";
  note?: string | null;
  officerName?: string | null;
}): { title: string; message: string } {
  const name = (opts.teacherName || "Teacher").trim();
  const by = opts.officerName?.trim() ? ` by ${opts.officerName.trim()}` : "";
  if (opts.decision === "approved") {
    return {
      title: `✅ ${name}, EXAM APPROVED`,
      message: `Your examination “${opts.examTitle}” was approved${by}.`,
    };
  }
  if (opts.decision === "rejected") {
    return {
      title: `❌ ${name}, EXAM NOT APPROVED`,
      message: `Your examination “${opts.examTitle}” was not approved${by}.${opts.note ? `\n\nReason:\n${opts.note}` : ""}`,
    };
  }
  return {
    title: `⚠️ ${name}, REVISION REQUESTED`,
    message: `Revision was requested for “${opts.examTitle}”${by}.${opts.note ? `\n\n${opts.note}` : ""}`,
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

export function schoolApplicationReceived(opts: {
  schoolName: string;
}): { title: string; message: string } {
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
  const hint = opts.loginHint?.trim()
    ? `\n\n${opts.loginHint.trim()}`
    : "\n\nSign in at /login with your School ID and email.";
  return {
    title: "🎉 School Application Approved!",
    message: `Congratulations! Your school application for ${opts.schoolName} has been approved.\n\nYour D4EXAM School ID is:\n${opts.schoolId}${hint}`,
  };
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
  const reason = (
    opts.reason || "Please update your application with the requested information."
  ).trim();
  return {
    title: "⚠️ Action Required",
    message: `Your school application for ${opts.schoolName} requires some changes before it can be approved.\n\n${reason}`,
  };
}
