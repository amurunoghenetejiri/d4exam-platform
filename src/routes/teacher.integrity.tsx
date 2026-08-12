import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Input } from "@/components/ui/input";
import * as mock from "@/data/mock";

export const Route = createFileRoute("/teacher/integrity")({
  head: () => ({
    meta: [
      { title: "Integrity — D4EXAM" },
      {
        name: "description",
        content: "Security and integrity events from examinations on your assigned courses.",
      },
    ],
  }),
  component: Page,
});

function Page() {
  const assigned = mock.currentTeacher.assignedCourses;
  const [q, setQ] = useState("");

  const events = useMemo(() => {
    let list = mock.integrityEvents.filter((e) => assigned.includes(e.exam));
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter(
        (e) =>
          e.student.toLowerCase().includes(s) ||
          e.matric.toLowerCase().includes(s) ||
          e.event.toLowerCase().includes(s) ||
          e.exam.toLowerCase().includes(s),
      );
    }
    return list;
  }, [assigned, q]);

  return (
    <>
      <PageHeader
        title="Integrity"
        description="Tab switches, fullscreen exits, and blocked actions during exams on your courses."
      />

      <div className="mb-4">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search student, event, exam…"
          className="max-w-md rounded-full"
        />
      </div>

      <SectionCard title="Recent events">
        {events.length === 0 ? (
          <EmptyState
            title="No integrity events"
            description="Events appear while students sit locked-down examinations."
          />
        ) : (
          <ul className="space-y-3">
            {events.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">{e.event}</p>
                  <p className="text-xs text-slate-500">
                    {e.student} · {e.matric} · {e.exam} · {e.time}
                  </p>
                </div>
                <StatusBadge status={e.severity} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
