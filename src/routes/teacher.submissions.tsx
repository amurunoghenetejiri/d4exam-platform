import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as mock from "@/data/mock";

export const Route = createFileRoute("/teacher/submissions")({
  head: () => ({
    meta: [
      { title: "Submissions — D4EXAM" },
      { name: "description", content: "Student submissions for your assigned course examinations." },
    ],
  }),
  component: Page,
});

function Page() {
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    if (!q.trim()) return mock.submissions;
    const s = q.toLowerCase();
    return mock.submissions.filter(
      (r) =>
        r.student.toLowerCase().includes(s) ||
        r.matric.toLowerCase().includes(s) ||
        r.exam.toLowerCase().includes(s),
    );
  }, [q]);

  return (
    <>
      <PageHeader
        title="Submissions"
        description="Objective scores auto-mark. Theory answers go to Marking Center."
        actions={
          <Button className="font-semibold" asChild>
            <Link to="/teacher/marking">Open Marking Center</Link>
          </Button>
        }
      />

      <div className="mb-4">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search student, matric, exam…"
          className="max-w-md rounded-full"
        />
      </div>

      <SectionCard title="Recent submissions">
        {rows.length === 0 ? (
          <EmptyState title="No submissions" description="Submissions appear after students sit approved exams." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Student</th>
                  <th className="px-3 py-2">Exam</th>
                  <th className="px-3 py-2">Submitted</th>
                  <th className="px-3 py-2">Objective</th>
                  <th className="px-3 py-2">Theory</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3">
                      <p className="font-semibold text-slate-900">{r.student}</p>
                      <p className="text-xs text-slate-500">{r.matric}</p>
                    </td>
                    <td className="px-3 py-3">{r.exam}</td>
                    <td className="px-3 py-3">{r.submitted}</td>
                    <td className="px-3 py-3">{r.objective}</td>
                    <td className="px-3 py-3">{r.theory}</td>
                    <td className="px-3 py-3">
                      <StatusBadge status={r.status} />
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
