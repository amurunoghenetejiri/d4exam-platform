import { createFileRoute } from "@tanstack/react-router";
import { ResultsRecordsPage } from "@/components/results/ResultsRecordsPage";

export const Route = createFileRoute("/admin/results")({
  head: () => ({
    meta: [{ title: "Result Records — D4EXAM" }],
  }),
  component: () => (
    <ResultsRecordsPage
      title="Result Records"
      description="School-wide results. Filter by session, semester, department, level, course and assessment type. Print and export professional records."
    />
  ),
});
