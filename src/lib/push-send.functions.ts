import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { createSign } from "node:crypto";

function adminClient() {
  const url =
    process.env["SUPABASE_URL"] ||
    process.env["VITE_SUPABASE_URL"] ||
    process.env["NEXT_PUBLIC_SUPABASE_URL"] ||
    "";
  const key =
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
    process.env["SUPABASE_SECRET_KEY"] ||
    process.env["SUPABASE_SERVICE_KEY"] ||
    process.env["SB_SERVICE_ROLE_KEY"] ||
    "";
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function appOrigin() {
  return (
    process.env["APP_URL"] ||
    process.env["VITE_APP_URL"] ||
    process.env["PUBLIC_APP_URL"] ||
    "https://d4exam-platform.vercel.app"
  ).replace(/\/$/, "");
}

type PushInput = {
  recipientUserId: string;
  title: string;
  message: string;
  link?: string | null;
};

type ServiceAccount = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

function parseServiceAccount(): ServiceAccount | null {
  const raw =
    process.env["FIREBASE_SERVICE_ACCOUNT_JSON"] ||
    process.env["GOOGLE_SERVICE_ACCOUNT_JSON"] ||
    "";
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    if (parsed.client_email && parsed.private_key) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function base64url(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getFcmAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      sub: sa.client_email,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
    }),
  );
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = base64url(signer.sign(sa.private_key!));
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`oauth token failed: ${text}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("oauth token missing");
  return json.access_token;
}

/**
 * Data-only FCM so Chrome does NOT auto-render a "Chrome · site" notification.
 * Our service worker shows the notification with the D4EXAM icon.
 */
async function sendFcmV1(
  token: string,
  title: string,
  body: string,
  link: string,
  sa: ServiceAccount,
  accessToken: string,
) {
  const projectId = sa.project_id || process.env["FIREBASE_PROJECT_ID"] || "d4exam-6506a";
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const origin = appOrigin();
  const icon = `${origin}/icon-192.png`;
  const absoluteLink = link.startsWith("http") ? link : `${origin}${link.startsWith("/") ? link : `/${link}`}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token,
        data: {
          title: String(title),
          body: String(body),
          message: String(body),
          link: String(absoluteLink),
          icon: String(icon),
          badge: String(icon),
          tag: "d4exam-notification",
        },
        webpush: {
          headers: {
            Urgency: "high",
            TTL: "86400",
          },
          fcm_options: {
            link: absoluteLink,
          },
        },
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false as const, error: text };
  }
  return { ok: true as const };
}

async function sendFcmLegacy(token: string, title: string, body: string, link: string, serverKey: string) {
  const origin = appOrigin();
  const icon = `${origin}/icon-192.png`;
  const res = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      Authorization: `key=${serverKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: token,
      data: {
        title,
        body,
        message: body,
        link: link || "/",
        icon,
        badge: icon,
        tag: "d4exam-notification",
      },
      priority: "high",
      content_available: true,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false as const, error: text };
  }
  const json = (await res.json().catch(() => ({}))) as { results?: { error?: string }[] };
  const err = json.results?.[0]?.error;
  if (err) return { ok: false as const, error: err };
  return { ok: true as const };
}

export const dispatchPushToUser = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const raw =
      data && typeof data === "object" && "data" in (data as object)
        ? (data as { data: unknown }).data
        : data;
    const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return {
      recipientUserId: String(o.recipientUserId || ""),
      title: String(o.title || "D4EXAM"),
      message: String(o.message || ""),
      link: o.link != null ? String(o.link) : "/",
    } satisfies PushInput;
  })
  .handler(async ({ data }) => {
    if (!data.recipientUserId || !data.title) {
      return { sent: 0, failed: 0, skipped: true as const, reason: "missing fields" };
    }

    const sb = adminClient();
    if (!sb) return { sent: 0, failed: 0, skipped: true as const, reason: "no supabase admin" };

    const { data: devices } = await sb
      .from("push_devices")
      .select("id, token")
      .eq("user_id", data.recipientUserId)
      .eq("enabled", true)
      .limit(25);

    const list = devices || [];
    if (!list.length) return { sent: 0, failed: 0, skipped: true as const, reason: "no devices" };

    const sa = parseServiceAccount();
    const legacyKey = process.env["FCM_SERVER_KEY"] || process.env["FIREBASE_SERVER_KEY"] || "";

    if (!sa && !legacyKey) {
      return {
        sent: 0,
        failed: 0,
        skipped: true as const,
        reason: "no fcm credentials on server (set FIREBASE_SERVICE_ACCOUNT_JSON)",
      };
    }

    let accessToken: string | null = null;
    if (sa) {
      try {
        accessToken = await getFcmAccessToken(sa);
      } catch (e) {
        return {
          sent: 0,
          failed: 0,
          skipped: true as const,
          reason: `oauth failed: ${(e as Error).message}`,
        };
      }
    }

    let sent = 0;
    let failed = 0;
    for (const d of list) {
      const token = (d as { token: string }).token;
      try {
        const result =
          sa && accessToken
            ? await sendFcmV1(token, data.title, data.message || "", data.link || "/", sa, accessToken)
            : await sendFcmLegacy(token, data.title, data.message || "", data.link || "/", legacyKey);

        if (result.ok) sent += 1;
        else {
          failed += 1;
          if (result.error && /NotRegistered|InvalidRegistration|UNREGISTERED|INVALID_ARGUMENT/i.test(result.error)) {
            await sb.from("push_devices").update({ enabled: false } as never).eq("token", token);
          }
        }
      } catch {
        failed += 1;
      }
    }
    return { sent, failed, skipped: false as const };
  });

export const sendTestNotificationToSelf = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const raw =
      data && typeof data === "object" && "data" in (data as object)
        ? (data as { data: unknown }).data
        : data;
    const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return {
      userId: String(o.userId || ""),
      role: String(o.role || ""),
    };
  })
  .handler(async ({ data }) => {
    if (!data.userId) return { ok: false as const, error: "userId required" };

    const link =
      data.role === "super_admin"
        ? "/super-admin/notifications"
        : data.role === "school_admin"
          ? "/admin/notifications"
          : data.role === "examination_officer"
            ? "/officer/notifications"
            : data.role === "teacher"
              ? "/teacher/notifications"
              : data.role === "student"
                ? "/student/notifications"
                : "/";

    const welcomeTitle = "Welcome to D4EXAM";
    const welcomeBody =
      "Secure online exams for schools — create papers, run CBT, monitor integrity, and release results in one place.";

    const sb = adminClient();
    if (sb) {
      await sb.from("notifications").insert({
        recipient_user_id: data.userId,
        title: welcomeTitle,
        message: welcomeBody,
        type: "system_alert",
        link,
        action_url: link,
      } as never);
    }

    const push = await dispatchPushToUser({
      data: {
        recipientUserId: data.userId,
        title: welcomeTitle,
        message: welcomeBody,
        link,
      },
    });

    return { ok: true as const, push };
  });
