import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/layout/PublicLayout";
const values = [
  { title: "Academic first", body: "Workflows modelled on real faculty, department and examination officer structures." },
  { title: "Integrity always", body: "Every attempt is monitored and auditable, so results can be defended." },
  { title: "Access everywhere", body: "Built for varied bandwidth, shared laboratories and personal devices alike." },
];

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Us — D4EXAM" },
      { name: "description", content: "D4EXAM builds professional examination infrastructure for schools, colleges and universities worldwide." },
      { property: "og:title", content: "About Us — D4EXAM" },
      { property: "og:description", content: "D4EXAM builds professional examination infrastructure for schools, colleges and universities worldwide." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <PublicLayout>
      <div className="mx-auto w-full max-w-[1100px] px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-extrabold sm:text-4xl">About D4EXAM</h1>
        <p className="mt-4 max-w-3xl text-muted-foreground">
          D4EXAM is a professional examination management platform built for schools, colleges,
          polytechnics and universities. We help institutions move paper-based assessment online
          without losing the rigour, structure and accountability that academic examinations demand.
        </p>
        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {values.map((v) => (
            <div key={v.title} className="surface-panel p-5">
              <h2 className="text-base font-semibold">{v.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{v.body}</p>
            </div>
          ))}
        </div>
        <div className="surface-panel mt-12 grid grid-cols-2 gap-6 p-8 lg:grid-cols-4">
          {[["182+","Institutions"],["84K+","Students"],["12K+","Examinations"],["98.5%","Success rate"]].map(([v,l]) => (
            <div key={l} className="text-center">
              <p className="font-display text-3xl font-extrabold text-primary">{v}</p>
              <p className="mt-1 text-sm text-muted-foreground">{l}</p>
            </div>
          ))}
        </div>
      </div>
    </PublicLayout>
  );
}
