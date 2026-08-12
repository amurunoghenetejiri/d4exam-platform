import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Input } from "@/components/ui/input";
import * as mock from "@/data/mock";

export const Route = createFileRoute("/teacher/results")({
  head: () => ({
    meta: [
      { title: "Results — D4EXAM" },
      {
        name: "description",
        content: "Results for examinations on your assigned courses (release controlled by officer).",
      },
    ],
  }),
  component: Page,
});

function Page() {
  const assigned = mock.currentTeacher.assignedCourses;
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    let list = mock.studentResults.filter((r) => assigned.includes(r.course));
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter(
        (r) =>
          r.course.toLowerCase().includes(s) ||
          r.title.toLowerCase().includes(s) ||
          r.grade.toLowerCase().includes(s),
      );
    }
    return list;
  }, [assigned, q]);

  return (
    <>
      <PageHeader
        title="Results"
        description="Scores for your courses. Final student visibility is controlled by the Examination Officer."
      />

      <div className="mb-4">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search course or title…"
          className="max-w-md rounded-full"
        />
      </div>

      <SectionCard title="Course results">
        {rows.length === 0 ? (
          <EmptyState
            title="No results yet"
            description="Results appear after exams complete and marking is done."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Course</th>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Sample score</th>
                  <th className="px-3 py-2">Grade</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3 font-semibold">{r.course}</td>
                    <td className="px-3 py-3">{r.title}</td>
                    <td className="px-3 py-3">{r.score}</td>
                    <td className="px-3 py-3">{r.grade}</td>
                    <td className="px-3 py-3">
                      <StatusBadge status={r.status.replaceAll("_", " ")} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}
