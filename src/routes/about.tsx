import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/layout/PublicLayout";

const values = [
  {
    title: "Academic first",
    body: "Workflows modelled on real faculty, department and examination officer structures so institutions keep the same academic hierarchy they already use on paper.",
  },
  {
    title: "Integrity always",
    body: "Every attempt is monitored and auditable - fullscreen exits, tab switches, face checks and officer actions - so results can be defended.",
  },
  {
    title: "Access everywhere",
    body: "Built for varied bandwidth, shared laboratories and personal devices alike. Students and staff only need a modern browser or the D4EXAM app.",
  },
];

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Us - D4EXAM" },
      {
        name: "description",
        content:
          "D4EXAM builds professional examination infrastructure for schools, colleges and universities worldwide.",
      },
      { property: "og:title", content: "About Us - D4EXAM" },
      {
        property: "og:description",
        content:
          "D4EXAM builds professional examination infrastructure for schools, colleges and universities worldwide.",
      },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <PublicLayout>
      <div className="mx-auto w-full max-w-[1100px] px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-extrabold sm:text-4xl">About D4EXAM</h1>
        <p className="mt-4 max-w-3xl text-muted-foreground leading-relaxed">
          D4EXAM is a professional examination management platform built for schools, colleges,
          polytechnics and universities. We help institutions move paper-based assessment online
          without losing the rigour, structure and accountability that academic examinations demand.
        </p>
        <p className="mt-4 max-w-3xl text-muted-foreground leading-relaxed">
          From school application and academic structure setup, through question banks, secure CBT
          delivery, live officer monitoring and automated marking, to result publication and
          institutional reports - D4EXAM is designed as end-to-end examination infrastructure, not a
          single-purpose quiz tool.
        </p>
        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {values.map((v) => (
            <div key={v.title} className="surface-panel p-5">
              <h2 className="text-base font-semibold">{v.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{v.body}</p>
            </div>
          ))}
        </div>
        <div className="surface-panel mt-12 grid grid-cols-2 gap-6 p-8 lg:grid-cols-4">
          {[
            ["182+", "Institutions"],
            ["84K+", "Students"],
            ["12K+", "Examinations"],
            ["98.5%", "Success rate"],
          ].map(([v, l]) => (
            <div key={l} className="text-center">
              <p className="font-display text-3xl font-extrabold text-primary">{v}</p>
              <p className="mt-1 text-sm text-muted-foreground">{l}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 rounded-2xl border border-slate-200 bg-slate-50/80 p-6 sm:p-8">
          <h2 className="text-lg font-bold text-slate-900">Our mission</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Make high-integrity online examinations practical for every institution - from technical
            schools to multi-campus universities - with role-based portals, transparent audit trails
            and security controls that officers actually use during live sessions.
          </p>
          <p className="mt-6 text-center text-xs text-slate-400">
            © 2026 D4EXAM. All rights reserved. · Smart. Secure. Seamless.
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
