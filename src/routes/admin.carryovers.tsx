import { createFileRoute } from "@tanstack/react-router";
import { CarryoversPage } from "@/components/results/CarryoversPage";

export const Route = createFileRoute("/admin/carryovers")({
  head: () => ({ meta: [{ title: "Carryover Students — D4EXAM" }] }),
  component: () => <CarryoversPage />,
});
