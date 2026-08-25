#!/usr/bin/env python3
from pathlib import Path

p = Path("src/lib/push.ts")
t = p.read_text()
if 'state === "granted" || state === "default"' not in t:
    start = t.find("export async function initNativePushIfNeeded")
    comment = t.rfind("/**", 0, start)
    end = t.find("\nexport ", start + 10)
    if end < 0:
        end = len(t)
    if comment < 0:
        comment = start
    new_fn = (
        "/** Called from root NativeBootstrap on session - native only, never web FCM. */\n"
        "export async function initNativePushIfNeeded(\n"
        "  userId?: string | null,\n"
        "  role?: string | null,\n"
        "): Promise<void> {\n"
        "  if (!isNativeShell()) return;\n"
        "  try {\n"
        "    await disableWebPushInNativeShell();\n"
        "    const state = await refreshNativePushPermissionState();\n"
        "    if (!userId) return;\n"
        "    if (state === \"granted\" || state === \"default\") {\n"
        "      void enableNativePushNotifications(userId, role);\n"
        "    }\n"
        "  } catch {\n"
        "    /* never crash startup */\n"
        "  }\n"
        "}\n"
    )
    p.write_text(t[:comment] + new_fn + t[end:])
    print("push.ts ok")
else:
    print("push.ts skip")

p = Path("src/lib/push-send.functions.ts")
t = p.read_text()
if "PRIORITY_MAX" not in t:
    old = '            sound: "default",\n            click_action: "FCM_PLUGIN_ACTIVITY",'
    new = (
        '            sound: "default",\n'
        '            default_sound: true,\n'
        '            default_vibrate_timings: true,\n'
        '            notification_priority: "PRIORITY_MAX",\n'
        '            visibility: "PUBLIC",\n'
        '            click_action: "FCM_PLUGIN_ACTIVITY",'
    )
    if old not in t:
        raise SystemExit("fcm missing")
    p.write_text(t.replace(old, new, 1))
    print("fcm ok")
else:
    print("fcm skip")

es = Path("src/lib/exam-security.ts")
et = es.read_text()
old_s = "    `On threshold: ${n.thresholdAction}`,"
new_s = '    `On threshold: ${n.thresholdAction}${n.thresholdAction === "pause" ? ` (${Math.floor((n.pauseDurationSeconds ?? 300) / 60)}m ${(n.pauseDurationSeconds ?? 300) % 60}s)` : ""}`,'
if old_s in et:
    es.write_text(et.replace(old_s, new_s, 1))
    print("summary ok")
else:
    print("summary skip")
print("DONE")
