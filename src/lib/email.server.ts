/**
 * Server-only email helper.
 * Uses Resend (https://resend.com) when RESEND_API_KEY is set on Vercel.
 * Optional: EMAIL_FROM like "D4EXAM <onboarding@yourdomain.com>"
 * Optional: APP_URL like "https://your-app.vercel.app" for login link in the body.
 */

export type SendEmailResult = { ok: true; id?: string } | { ok: false; error: string };

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
    "https://platform.vercel.app"
  ).replace(/\/$/, "");
  const loginUrl = `${appUrl}/login`;

  const subject = `Your school is approved on D4EXAM — ${params.schoolName}`;

  const text = [
    `Hello ${params.applicantName},`,
    ``,
    `Congratulations! Your school application has been approved on D4EXAM.`,
    ``,
    `=== Your school profile ===`,
    `School name: ${params.schoolName}`,
    `School code: ${params.schoolCode}`,
    `Admin name: ${params.applicantName}`,
    `Login email: ${params.adminEmail}`,
    `Temporary password: ${params.adminPassword}`,
    params.phone ? `Phone: ${params.phone}` : null,
    params.officialEmail ? `Official school email: ${params.officialEmail}` : null,
    ``,
    `=== How to sign in ===`,
    `1. Open ${loginUrl}`,
    `2. Enter school code: ${params.schoolCode}`,
    `3. Enter email: ${params.adminEmail}`,
    `4. Enter the temporary password above`,
    `5. Change your password after first login`,
    ``,
    `Keep this email private. Do not share your password.`,
    ``,
    `— D4EXAM Team`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const html = `
  <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #0f172a; line-height: 1.5;">
    <h1 style="font-size: 20px; margin-bottom: 8px;">Your school is approved</h1>
    <p>Hello <strong>${escapeHtml(params.applicantName)}</strong>,</p>
    <p>Congratulations! Your school application has been <strong>approved</strong> on D4EXAM. Your school space and admin profile are ready.</p>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background: #f8fafc; width: 40%;"><strong>School name</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">${escapeHtml(params.schoolName)}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background: #f8fafc;"><strong>School code</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0; font-family: ui-monospace, monospace; font-size: 16px;"><strong>${escapeHtml(params.schoolCode)}</strong></td></tr>
      <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background: #f8fafc;"><strong>Admin name</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">${escapeHtml(params.applicantName)}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background: #f8fafc;"><strong>Login email</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">${escapeHtml(params.adminEmail)}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background: #f8fafc;"><strong>Temporary password</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0; font-family: ui-monospace, monospace;">${escapeHtml(params.adminPassword)}</td></tr>
      ${params.phone ? `<tr><td style="padding: 8px; border: 1px solid #e2e8f0; background: #f8fafc;"><strong>Phone</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">${escapeHtml(params.phone)}</td></tr>` : ""}
      ${params.officialEmail ? `<tr><td style="padding: 8px; border: 1px solid #e2e8f0; background: #f8fafc;"><strong>Official school email</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">${escapeHtml(params.officialEmail)}</td></tr>` : ""}
    </table>
    <p style="margin: 16px 0;">
      <a href="${escapeHtml(loginUrl)}" style="display: inline-block; background: #1d4ed8; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 8px; font-weight: 600;">Sign in to D4EXAM</a>
    </p>
    <p style="font-size: 13px; color: #475569;">Use your <strong>school code</strong>, <strong>email</strong>, and the <strong>temporary password</strong> above. Change your password after the first login.</p>
    <p style="font-size: 12px; color: #94a3b8; margin-top: 24px;">— D4EXAM Team</p>
  </div>`.trim();

  return sendEmail({
    to: params.to,
    subject,
    html,
    text,
  });
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, """);
}
