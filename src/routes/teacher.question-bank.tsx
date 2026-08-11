import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

export const Route = createFileRoute("/teacher/question-bank")({
  head: () => ({
    meta: [
      { title: "Question Bank — D4EXAM" },
      { name: "description", content: "Reusable questions tagged by topic, type and difficulty." },
      { property: "og:title", content: "Question Bank — D4EXAM" },
      { property: "og:description", content: "Reusable questions tagged by topic, type and difficulty." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <RecordsPage
      title="Question Bank"
      description="Reusable questions tagged by topic, type and difficulty."
      stats={[]}
      rows={mock.questionBank}
      columns={[{ key: "text", header: "Question" }, { key: "type", header: "Type", hideOnMobile: true }, { key: "topic", header: "Topic", hideOnMobile: true }, { key: "difficulty", header: "Difficulty" }, { key: "marks", header: "Marks", hideOnMobile: true }]}
      tableTitle="Question Bank"
    />
  );
}
