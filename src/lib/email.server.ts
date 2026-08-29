/**
 * Server-only email helper (Resend).
 * RESEND_API_KEY on Vercel enables sending.
 * Build-verified helper for school approval emails.
 */

export type SendEmailResult = { ok: true; id?: string } | { ok: false; error: string };

function escapeHtml(s: string) {
  // Avoid raw HTML entities in source (they can be corrupted by some tools).
  const amp = String.fromCharCode(38);
  return String(s)
    .replace(/&/g, amp + "amp;")
    .replace(/</g, amp + "lt;")
    .replace(/>/g, amp + "gt;")
    .replace(/"/g, amp + "quot;");
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env["RESEND_API_KEY"];
  const from =
    process.env["EMAIL_FROM"] ||
    process.env["RESEND_FROM"] ||
    "D4EXAM <onboarding@resend.dev>";

  if (!apiKey) {
    console.error("[email] RESEND_API_KEY is not set — cannot send email");
    return {
      ok: false,
      error: "Email is not configured (missing RESEND_API_KEY on the server).",
    };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
      }),
    });

    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      const msg = body.message || `Email provider error (${res.status})`;
      console.error("[email] send failed:", msg);
      return { ok: false, error: msg };
    }
    return { ok: true, id: body.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown email error";
    console.error("[email] send exception:", msg);
    return { ok: false, error: msg };
  }
}

export async function sendSchoolApprovalEmail(params: {
  to: string;
  applicantName: string;
  schoolName: string;
  schoolCode: string;
  adminEmail: string;
  adminPassword: string;
  officialEmail?: string | null;
  phone?: string | null;
}): Promise<SendEmailResult> {
  const appUrl = (
    process.env["APP_URL"] ||
    process.env["VITE_APP_URL"] ||
    "https://d4exam-platform.vercel.app"
  ).replace(/\/$/, "");
  const loginUrl = `${appUrl}/login`;

  const subject = `Your school is approved on D4EXAM — ${params.schoolName}`;

  const text = [
    `Hello ${params.applicantName},`,
    ``,
    `Congratulations! Your school application has been approved on D4EXAM.`,
    ``,
    `School name: ${params.schoolName}`,
    `School code: ${params.schoolCode}`,
    `Admin name: ${params.applicantName}`,
    `Login email: ${params.adminEmail}`,
    `Temporary password: ${params.adminPassword}`,
    params.phone ? `Phone: ${params.phone}` : null,
    params.officialEmail ? `Official school email: ${params.officialEmail}` : null,
    ``,
    `Sign in: ${loginUrl}`,
    `Use school code + email + temporary password. Change password after first login.`,
    ``,
    `— D4EXAM Team`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const html = [
    `<div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; color: #0f172a; line-height: 1.5;">`,
    `<h1 style="font-size: 20px;">Your school is approved</h1>`,
    `<p>Hello <strong>${escapeHtml(params.applicantName)}</strong>,</p>`,
    `<p>Your school application has been <strong>approved</strong> on D4EXAM.</p>`,
    `<p><strong>School name:</strong> ${escapeHtml(params.schoolName)}</p>`,
    `<p><strong>School code:</strong> ${escapeHtml(params.schoolCode)}</p>`,
    `<p><strong>Login email:</strong> ${escapeHtml(params.adminEmail)}</p>`,
    `<p><strong>Temporary password:</strong> ${escapeHtml(params.adminPassword)}</p>`,
    params.phone ? `<p><strong>Phone:</strong> ${escapeHtml(params.phone)}</p>` : "",
    params.officialEmail
      ? `<p><strong>Official email:</strong> ${escapeHtml(params.officialEmail)}</p>`
      : "",
    `<p><a href="${escapeHtml(loginUrl)}">Sign in to D4EXAM</a></p>`,
    `<p style="font-size: 12px; color: #94a3b8;">— D4EXAM Team</p>`,
    `</div>`,
  ].join("\n");

  return sendEmail({
    to: params.to,
    subject,
    html,
    text,
  });
}
