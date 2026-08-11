import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

export const Route = createFileRoute("/admin/levels")({
  head: () => ({
    meta: [
      { title: "Levels — D4EXAM" },
      { name: "description", content: "Academic levels configured for your institution." },
      { property: "og:title", content: "Levels — D4EXAM" },
      { property: "og:description", content: "Academic levels configured for your institution." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <RecordsPage
      title="Levels"
      description="Academic levels configured for your institution."
      stats={[]}
      rows={[{ id: '100', name: '100 Level', students: 1240 }, { id: '200', name: '200 Level', students: 1120 }, { id: '300', name: '300 Level', students: 980 }, { id: '400', name: '400 Level', students: 860 }, { id: '500', name: '500 Level', students: 620 }]}
      columns={[{ key: "name", header: "Level" }, { key: "students", header: "Students" }]}
      tableTitle="Levels"
    />
  );
}
