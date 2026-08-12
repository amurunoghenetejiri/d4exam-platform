import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { GraduationCap, Users, BookOpen, FileText, Bell } from "lucide-react";
import { useCount, useRows } from "@/lib/queries";
import { useSessionUser } from "@/lib/session";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [{ title: "School Admin Dashboard — D4EXAM" }],
  }),
  component: Page,
});

type Exam = {
  id: string;
  title: string;
  status: string;
  scheduled_start: string | null;
  duration_minutes: number;
};

type Notif = {
  id: string;
  title: string;
  created_at: string;
};

function Page() {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;
  const enabled = Boolean(schoolId);

  const students = useCount("students", schoolId ? [{ column: "school_id", value: schoolId }] : [], enabled);
  const teachers = useCount("teachers", schoolId ? [{ column: "school_id", value: schoolId }] : [], enabled);
  const courses = useCount("courses", schoolId ? [{ column: "school_id", value: schoolId }] : [], enabled);
  const exams = useCount("examinations", schoolId ? [{ column: "school_id", value: schoolId }] : [], enabled);

  const todayExams = useRows<Exam>({
    table: "examinations",
    select: "id, title, status, scheduled_start, duration_minutes",
    filters: schoolId ? [{ column: "school_id", value: schoolId }] : [],
    order: { column: "scheduled_start", ascending: true },
    limit: 6,
    enabled,
  });

  const notifications = useRows<Notif>({
    table: "notifications",
    select: "id, title, created_at",
    filters: user?.userId ? [{ column: "recipient_user_id", value: user.userId }] : [],
    order: { column: "created_at", ascending: false },
    limit: 5,
    enabled: Boolean(user?.userId),
  });

  return (
    <>
      <PageHeader
        title={`Welcome back${user?.fullName ? `, ${user.fullName}` : ""}`}
        description={user?.schoolName ? `${user.schoolName} · School admin` : "School admin dashboard"}
      />

      {!schoolId && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your account is not linked to a school yet. Counts stay at zero until a school is assigned.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Total Students" value={fmt(students)} icon={GraduationCap} />
        <Stat label="Total Teachers" value={fmt(teachers)} icon={Users} />
        <Stat label="Total Courses" value={fmt(courses)} icon={BookOpen} />
        <Stat label="Total Exams" value={fmt(exams)} icon={FileText} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Examinations"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/admin/examinations">View All</Link>
            </Button>
          }
        >
          {(todayExams.data ?? []).length === 0 ? (
            <EmptyState title="No examinations" description="Exams created for this school will appear here." />
          ) : (
            <ul className="space-y-3">
              {(todayExams.data ?? []).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{e.title}</p>
                    <p className="text-xs text-slate-500">
                      {e.scheduled_start ? new Date(e.scheduled_start).toLocaleString() : "Not scheduled"} ·{" "}
                      {e.duration_minutes} min
                    </p>
                  </div>
                  <StatusBadge status={e.status} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Notifications"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/admin/notifications">View All</Link>
            </Button>
          }
        >
          {(notifications.data ?? []).length === 0 ? (
            <EmptyState title="No notifications" description="System and school notices will appear here." />
          ) : (
            <ul className="space-y-3">
              {(notifications.data ?? []).map((n) => (
                <li key={n.id} className="flex items-start gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                    <p className="text-xs text-slate-500">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}

function fmt(q: { isLoading: boolean; data?: number }) {
  return q.isLoading ? "…" : String(q.data ?? 0);
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{value}</p>
        </div>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}
