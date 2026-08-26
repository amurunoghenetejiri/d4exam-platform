# D4EXAM Notifications

## Architecture

- **In-app**: rows in `notifications` (`recipient_user_id` = auth user id)
- **Push**: `dispatchPushToUser` → FCM (web) or native device tokens
- **Native APK**: Local Notifications as D4EXAM (not Chrome); web FCM disabled in shell
- **Core API**: `src/lib/notify.ts` + `src/lib/notificationService.ts`
- **Copy templates**: `src/lib/notify-messages.ts`
- **Named wrappers**: `src/lib/notify-named.ts`
- **Applicants**: `src/lib/notify-applicants.ts`

Every successful `notifyUser` / `notifyMany` insert fires push.

## Roles covered

| Role | Events (examples) |
|------|-------------------|
| Student | Exam approved/available/reminders, results, officer warnings, auto-submit, terminate |
| Teacher | Exam submitted decision (approve/reject/revision) |
| Officer | Exam submitted for approval, results pending, security (deduped) |
| School admin | Weekly summaries, school-level events |
| Super admin | New school applications, platform summaries |
| Applicant | Application received / approved (school ID + login) |

## Permission

- Soft prompt after login (`NotificationPermissionPrompt`) — once per role until granted/denied
- Soft prompt after school application submit
- Settings → Enable notifications anytime

## No manual SQL required

Uses existing `notifications` and `push_devices` tables and optional `insert_notification` RPC.

## Native vs Chrome

Inside the Capacitor APK, browser Notification / service-worker push is disabled. System alerts use D4EXAM local notifications. Install the latest APK that includes `@capacitor/local-notifications`.
