import { createFileRoute } from "@tanstack/react-router";
import { ResultsRecordsPage } from "@/components/results/ResultsRecordsPage";

export const Route = createFileRoute("/teacher/results")({
  head: () => ({
    meta: [
      { title: "Result Records — D4EXAM" },
      { name: "description", content: "Results for courses you teach." },
    ],
  }),
  component: () => (
    <ResultsRecordsPage
      title="Result Records"
      description="Only courses assigned to you. Filter, print and export official test and examination records."
    />
  ),
});
