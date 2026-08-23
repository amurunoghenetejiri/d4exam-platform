# D4EXAM Notifications (production)

## Architecture

```
Real event (exam submit / approve / schedule / result…)
        ↓
src/lib/notify.ts  OR  src/lib/notificationService.ts
        ↓
PostgreSQL public.notifications  (in-app, RLS by recipient_user_id)
        ↓
dispatchPushToUser → FCM → phone (push_devices tokens)
```

- **In-app:** bell + `/…/notifications` pages (existing UI unchanged).
- **Phone:** Web Push / FCM (Capacitor-ready via `src/native/notificationService.ts`).
- **No fake data** — inserts only for real users and real exam IDs.

## Roles covered

| Role | Typical events |
|------|----------------|
| Teacher | Exam submitted, approved, rejected, revision, scheduled |
| Examination officer | Exam submitted for approval, results pending |
| School admin | School-wide announcements / system |
| Student | Exam available/scheduled, reminders, results, officer warnings |
| Super admin | System / applications |

Helpers: `notifyOfficersExamSubmitted`, `notifyTeacherExamDecision`, `notifyStudentsExamApproved`, etc. in `src/lib/notify.ts`. Prefer importing from `src/lib/notificationService.ts` for new code.

## Live exam countdown

- **Authoritative time:** `examinations.scheduled_start` in the database.
- **UI:** `student.examinations.tsx` already computes `remaining = scheduled_start - now` every second (not stored in DB).
- Phone notifications do **not** tick every second (platform limit). Reminders are discrete (24h / 1h / 30m / 10m / start).

## Scheduled reminders (server)

`processExamReminders` in `src/lib/exam-reminder.functions.ts`:

- Scans exams with `scheduled_start` in the next ~25 hours.
- Sends student notifications + push at 24h, 1h, 30m, 10m, and start.
- **Idempotent** via `entity_id = {examId}:{type}` so refreshes do not duplicate.

### How to run on a schedule

Call the server function every 1–2 minutes (Vercel Cron, GitHub Action, or external cron hitting a protected route that invokes `processExamReminders`).

Requires `SUPABASE_SERVICE_ROLE_KEY` on the server.

## Preferences

Settings → Notifications toggles (`notification-prefs.ts`):

- Exam reminders
- Result publications
- Integrity alerts
- Product announcements

`isNotificationTypeAllowed` can filter types on the client when using `notifyUserWithPrefs`.

## Security

- RLS: users only read/update/delete **their** `recipient_user_id` rows.
- Push tokens in `push_devices` scoped to `user_id`.
- Never put service-role keys in the browser.

## Capacitor (later)

Same backend events; swap `src/native/notificationService.ts` to `@capacitor/push-notifications` when packaging Android/iOS. Web path stays FCM.
