import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import * as mock from "@/data/mock";
import type { ExamStatus } from "@/types";

export const Route = createFileRoute("/student/examinations")({
  head: () => ({
    meta: [
      {
        title: "My Examinations — D4EXAM",
      },
      {
        name: "description",
        content:
          "Only examinations approved by the Examination Officer and scheduled for delivery appear here.",
      },
    ],
  }),
  component: Page,
});

/** Students never see draft / pending_approval / changes_requested / rejected */
const VISIBLE: ExamStatus[] = [
  "approved",
  "scheduled",
  "published",
  "ongoing",
  "closed",
  "completed",
];

function Page() {
  const enrolled = mock.currentStudent.enrolledCourses;

  const exams = useMemo(() => {
    return mock.studentExams.filter((e) => {
      const code = e.courseCode ?? e.code;
      if (!enrolled.includes(code)) return false;
      const status = String(e.status).toLowerCase() as ExamStatus;
      return VISIBLE.includes(status) || ["scheduled", "ongoing", "completed"].includes(status);
    });
  }, [enrolled]);

  const upcoming = exams.filter((e) =>
    ["scheduled", "approved", "published"].includes(String(e.status).toLowerCase()),
  );
  const live = exams.filter((e) => String(e.status).toLowerCase() === "ongoing");
  const done = exams.filter((e) =>
    ["completed", "closed"].includes(String(e.status).toLowerCase()),
  );

  return (
    <>
      <PageHeader
        title="My Examinations"
        description="You only see exams after the Examination Officer has approved them. Drafts and pending submissions are hidden."
      />

      {exams.length === 0 ? (
        <EmptyState
          title="No examinations available"
          description="When your lecturers submit exams and the officer approves them, they will appear here."
        />
      ) : (
        <div className="space-y-6">
          {live.length > 0 && (
            <SectionCard title="Live now">
              <ExamList items={live} canStart />
            </SectionCard>
          )}
          <SectionCard title="Upcoming">
            {upcoming.length === 0 ? (
              <p className="text-sm text-slate-500">No upcoming examinations.</p>
            ) : (
              <ExamList items={upcoming} />
            )}
          </SectionCard>
          <SectionCard title="Completed">
            {done.length === 0 ? (
              <p className="text-sm text-slate-500">No completed examinations yet.</p>
            ) : (
              <ExamList items={done} />
            )}
          </SectionCard>
        </div>
      )}
    </>
  );
}

function ExamList({
  items,
  canStart,
}: {
  items: typeof mock.studentExams;
  canStart?: boolean;
}) {
  return (
    <ul className="space-y-3">
      {items.map((e) => (
        <li
          key={e.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">{e.title}</p>
            <p className="text-xs text-slate-500">
              {e.courseCode ?? e.code} · {e.course} · {e.duration} min · {e.questions} questions
            </p>
            <p className="text-xs text-slate-400">{e.date}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={String(e.status).replaceAll("_", " ")} />
            {canStart && (
              <Button size="sm" className="font-semibold" asChild>
                <Link to="/student/exam/$id" params={{ id: e.id }}>
                  Start
                </Link>
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
