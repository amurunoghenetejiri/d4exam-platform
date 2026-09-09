import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/layout/PublicLayout";

const values = [
  {
    title: "Academic first",
    body: "Workflows modelled on real faculty, department and examination officer structures so institutions do not reinvent their process."},
  {
    title: "Integrity always",
    body: "Every attempt is monitored and auditable — fullscreen, tab, camera and officer actions — so results can be defended."},
  {
    title: "Access everywhere",
    body: "Built for varied bandwidth, shared laboratories and personal devices. The same secure experience on web and the D4EXAM app."},
];

const pillars = [
  {
    title: "What we build",
    body: "D4EXAM is a full examination management platform: school onboarding, academic structure, question banks, CBT delivery, live monitoring, automated and manual marking, and result publication."},
  {
    title: "Who we serve",
    body: "Technical schools, colleges, polytechnics and universities that need institution-grade CBT without sacrificing academic control or auditability."},
  {
    title: "How we work",
    body: "Role-based portals for students, teachers, school admins and departmental officers. Security settings are per examination. Officers can pause, warn or terminate live attempts."},
  {
    title: "Trust & data",
    body: "Candidate and institutional data is used only to run examinations and produce academic records. We do not sell personal data. See our Privacy Policy for retention and rights."},
];

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Us — D4EXAM" },
      {
        name: "description",
        content:
          "D4EXAM builds professional examination infrastructure for schools, colleges and universities worldwide.",
      },
      { property: "og:title", content: "About Us — D4EXAM" },
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
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">About D4EXAM</p>
        <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Smart. Secure. Seamless.</h1>
        <p className="mt-4 max-w-3xl text-muted-foreground leading-relaxed">
          D4EXAM is a professional examination management platform built for schools, colleges,
          polytechnics and universities. We help institutions move paper-based assessment online
          without losing the rigour, structure and accountability that academic examinations demand.
        </p>

        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {values.map((v) => (
            <div key={v.title} className="surface-panel p-5">
              <h2 className="text-base font-semibold">{v.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{v.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {pillars.map((p) => (
            <div key={p.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-bold text-slate-900">{p.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{p.body}</p>
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

        <div className="mt-14 border-t border-slate-200 pt-8 text-center">
          <p className="text-sm font-semibold text-slate-800">D4EXAM</p>
          <p className="mt-1 text-xs text-slate-500">Smart Examination System</p>
          <p className="mt-3 text-[11px] text-slate-400">
            © 2026 D4EXAM. All rights reserved. · Smart. Secure. Seamless.
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
