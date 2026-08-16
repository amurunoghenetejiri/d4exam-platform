import { createFileRoute } from "@tanstack/react-router";
import { CbtExamPage } from "@/components/cbt/CbtExamSession";

export const Route = createFileRoute("/officer/exam-preview/$id")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Exam Preview — D4EXAM" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CbtExamPage,
});
