import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarClock, CheckCircle2, BookOpen, TrendingUp } from "lucide-react";
import { PageHeader, StatCard, SectionCard, StatusBadge, InfoRow } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { currentStudent, studentExams, studentResults, studentCourses } from "@/data/mock";

export const Route = createFileRoute("/student/")({
  head: () => ({
    meta: [
      { title: "Student Dashboard — D4EXAM" },
      { name: "description", content: "Upcoming examinations, results, courses and notifications for your student account." },
      { property: "og:title", content: "Student Dashboard — D4EXAM" },
      { property: "og:description", content: "Upcoming examinations, results, courses and notifications for your student account." },
    ],
  }),
  component: Page,
});

function Page() {
  const upcoming = studentExams.filter((e) => e.status !== "completed");
  const average = Math.round(studentResults.reduce((a, r) => a + r.score, 0) / studentResults.length * 10) / 10;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${currentStudent.name}`}
        description={`${currentStudent.department} · ${currentStudent.level} · ${currentStudent.school}`}
        actions={<Button asChild><Link to="/student/examinations">View examinations</Link></Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Upcoming exams" value={upcoming.length} icon={CalendarClock} tone="info" />
        <StatCard label="Completed exams" value={studentExams.length - upcoming.length} icon={CheckCircle2} />
        <StatCard label="Registered courses" value={studentCourses.length} icon={BookOpen} tone="aqua" />
        <StatCard label="Average score" value={`${average}%`} icon={TrendingUp} tone="warning" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_minmax(0,1fr)]">
        <SectionCard
          title="Upcoming examinations"
          action={<Button variant="ghost" size="sm" asChild><Link to="/student/examinations">See all</Link></Button>}
        >
          <ul className="space-y-3">
            {upcoming.map((e) => (
              <li key={e.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border p-3.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold">{e.code} — {e.title}</p>
                    <StatusBadge status={e.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{e.date} · {e.questions} questions · {e.duration} minutes</p>
                </div>
                <Button size="sm" asChild>
                  <Link to="/student/examinations/$examId" params={{ examId: e.id }}>View exam</Link>
                </Button>
              </li>
            ))}
          </ul>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Recent results" action={<Button variant="ghost" size="sm" asChild><Link to="/student/results">All results</Link></Button>}>
            <ul className="space-y-2">
              {studentResults.slice(0, 4).map((r) => (
                <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-1.5">
                  <span className="truncate text-sm">{r.course} <span className="text-muted-foreground">· {r.title}</span></span>
                  <span className="text-sm font-semibold">{r.score}% <span className="text-primary">{r.grade}</span></span>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Student record">
            <InfoRow label="Matric number" value={currentStudent.matric} />
            <InfoRow label="Department" value={currentStudent.department} />
            <InfoRow label="Level" value={currentStudent.level} />
            <InfoRow label="Session" value={currentStudent.session} />
            <InfoRow label="Semester" value={currentStudent.semester} />
          </SectionCard>
        </div>
      </div>
    </>
  );
}
