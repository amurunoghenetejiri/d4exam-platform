import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Check } from "lucide-react";

const groups = [
  { title: "Question Authoring", items: ["Reusable question bank", "MCQ, true/false and theory", "Topic and difficulty tagging", "Bulk import and duplication"] },
  { title: "Examination Builder", items: ["Eight-step guided builder", "Marks and negative marking", "Scheduling windows", "Preview before submission"] },
  { title: "Security & Integrity", items: ["Fullscreen enforcement", "Tab switch thresholds", "Copy/paste restriction", "Camera and microphone checks"] },
  { title: "Delivery", items: ["Low-bandwidth CBT engine", "Autosave and resume", "Question navigator", "Connection status monitoring"] },
  { title: "Marking & Results", items: ["Automated objective marking", "Theory marking centre", "Grade distribution analytics", "Officer approval workflow"] },
  { title: "Administration", items: ["Student CSV/Excel import", "Faculties, departments, levels", "Academic sessions and semesters", "Full audit logging"] },
];

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "Features — D4EXAM Examination Platform" },
      { name: "description", content: "Question banks, exam scheduling, CBT delivery, integrity monitoring, automated marking, result approval and institutional reporting." },
      { property: "og:title", content: "Features — D4EXAM Examination Platform" },
      { property: "og:description", content: "Question banks, exam scheduling, CBT delivery, integrity monitoring, automated marking, result approval and institutional reporting." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <PublicLayout>
      <div className="mx-auto w-full max-w-[1100px] px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-extrabold sm:text-4xl">Everything an institution needs to examine online</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          D4EXAM covers the full examination lifecycle — from question authoring and scheduling to
          secure delivery, marking, officer approval and result publication.
        </p>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <section key={g.title} className="surface-panel p-5">
              <h2 className="text-base font-semibold">{g.title}</h2>
              <ul className="mt-3 space-y-2">
                {g.items.map((i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    {i}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </PublicLayout>
  );
}
