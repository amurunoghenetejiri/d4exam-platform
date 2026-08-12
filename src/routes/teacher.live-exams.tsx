import { createFileRoute } from "@tanstack/react-router";
import { Radio, Users, AlertTriangle } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

export const Route = createFileRoute("/teacher/live-exams")({
  head: () => ({
    meta: [
      { title: "Live Exams — D4EXAM" },
      { name: "description", content: "Monitor ongoing examinations for your assigned courses." },
    ],
  }),
  component: Page,
});

function Page() {
  const assigned = mock.currentTeacher.assignedCourses;
  const live = mock.studentExams.filter(
    (e) =>
      assigned.includes(e.courseCode ?? e.code) &&
      String(e.status).toLowerCase() === "ongoing",
  );
  // Demo: also show scheduled as "about to start" for teacher visibility
  const upcoming = mock.teacherExams.filter(
    (e) =>
      assigned.includes(e.courseCode ?? e.code) &&
      ["scheduled", "approved", "published"].includes(String(e.status).toLowerCase()),
  );

  const flags = mock.integrityEvents.filter((e) => assigned.includes(e.exam)).slice(0, 5);

  return (
    <>
      <PageHeader
        title="Live Exams"
        description="Watch active sessions on your courses. Full control remains with the Examination Officer."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-3">
        <Stat label="Live now" value={String(live.length)} icon={Radio} />
        <Stat label="Upcoming" value={String(upcoming.length)} icon={Users} />
        <Stat label="Open flags" value={String(flags.length)} icon={AlertTriangle} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="In progress">
          {live.length === 0 ? (
            <EmptyState
              title="No live examinations"
              description="When an approved exam is ongoing, candidates appear here."
            />
          ) : (
            <ul className="space-y-3">
              {live.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3"
                >
                  <div>
                    <p className="text-sm font-bold text-slate-900">{e.title}</p>
                    <p className="text-xs text-slate-500">
                      {e.courseCode} · {e.duration} min · {e.questions} questions
                    </p>
                  </div>
                  <StatusBadge status="ongoing" />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Recent integrity flags">
          {flags.length === 0 ? (
            <EmptyState title="No flags" description="Integrity alerts will show during live sessions." />
          ) : (
            <ul className="space-y-2">
              {flags.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{f.event}</p>
                    <p className="text-xs text-slate-500">
                      {f.student} · {f.exam}
                    </p>
                  </div>
                  <StatusBadge status={f.severity} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {upcoming.length > 0 && (
        <SectionCard className="mt-6" title="Scheduled on your courses">
          <ul className="space-y-2">
            {upcoming.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-bold">{e.title}</p>
                  <p className="text-xs text-slate-500">{e.date}</p>
                </div>
                <StatusBadge status={String(e.status).replaceAll("_", " ")} />
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Radio;
}) {
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
