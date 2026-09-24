import { createFileRoute } from "@tanstack/react-router";
import { ResultsRecordsPage } from "@/components/results/ResultsRecordsPage";

export const Route = createFileRoute("/teacher/results")({
  head: () => ({
    meta: [
      { title: "Results / Analysis — D4EXAM" },
      { name: "description", content: "Results and performance analysis for your courses." },
    ],
  }),
  component: () => (
    <ResultsRecordsPage
      title="Results / Analysis"
      description="View official scores for your courses, then open Analysis for pass rate, averages and grade distribution."
      showAnalysisTab
    />
  ),
});
