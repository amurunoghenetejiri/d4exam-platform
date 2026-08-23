import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

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

type PushInput = {
  recipientUserId: string;
  title: string;
  message: string;
  link?: string | null;
};

async function sendFcmLegacy(token: string, title: string, body: string, link: string, serverKey: string) {
  const res = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      Authorization: `key=${serverKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: token,
      notification: { title, body, click_action: link || "/" },
      data: { title, body, message: body, link: link || "/" },
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

    const legacyKey = process.env["FCM_SERVER_KEY"] || process.env["FIREBASE_SERVER_KEY"] || "";
    if (!legacyKey) {
      return { sent: 0, failed: 0, skipped: true as const, reason: "no fcm credentials on server" };
    }

    let sent = 0;
    let failed = 0;
    for (const d of list) {
      const token = (d as { token: string }).token;
      try {
        const result = await sendFcmLegacy(token, data.title, data.message || "", data.link || "/", legacyKey);
        if (result.ok) sent += 1;
        else {
          failed += 1;
          if (result.error && /NotRegistered|InvalidRegistration/i.test(result.error)) {
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

    const sb = adminClient();
    if (sb) {
      await sb.from("notifications").insert({
        recipient_user_id: data.userId,
        title: "Test notification",
        message: "This is a D4EXAM test notification. If you see this, in-app notifications are working.",
        type: "system_alert",
        link,
        action_url: link,
      } as never);
    }

    const push = await dispatchPushToUser({
      data: {
        recipientUserId: data.userId,
        title: "D4EXAM Test",
        message: "This is a test push notification from D4EXAM.",
        link,
      },
    });

    return { ok: true as const, push };
  });
