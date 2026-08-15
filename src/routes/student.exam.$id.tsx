import { createFileRoute } from "@tanstack/react-router";
import { CbtExamPage } from "@/components/cbt/CbtExamSession";

export const Route = createFileRoute("/student/exam/$id")({
  head: () => ({
    meta: [
      { title: "CBT Examination — D4EXAM" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CbtExamPage,
});
