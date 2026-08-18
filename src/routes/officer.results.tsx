import { createFileRoute } from "@tanstack/react-router";
import { OfficerResultsPage } from "@/components/officer/OfficerResultsPage";

export const Route = createFileRoute("/officer/results")({
  head: () => ({ meta: [{ title: "Results Release — D4EXAM" }] }),
  component: OfficerResultsPage,
});
