import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { ShieldCheck, Gauge, Users, Globe2, Lock, Eye } from "lucide-react";

const values = [
  {
    title: "Academic first",
    body: "Workflows modelled on real faculty, department and examination officer structures so institutions do not have to bend their process to the software.",
  },
  {
    title: "Integrity always",
    body: "Every attempt is monitored and auditable. Fullscreen, tab focus, face checks and officer oversight produce a defensible record for results.",
  },
  {
    title: "Access everywhere",
    body: "Built for varied bandwidth, shared laboratories and personal devices. The same secure session works on campus labs and candidate phones.",
  },
];

const pillars = [
  {
    icon: ShieldCheck,
    title: "Exam integrity",
    body: "Fullscreen lockdown, tab monitoring, randomised papers, live officer monitor, camera and microphone controls where enabled by the institution.",
  },
  {
    icon: Gauge,
    title: "Reliable CBT delivery",
    body: "Low-latency sessions designed for everyday devices. Answers auto-save so a brief network drop does not erase a candidate's work.",
  },
  {
    icon: Users,
    title: "Role-based portals",
    body: "Students, teachers, school admins and departmental officers each get a focused workspace — no shared passwords, no confused permissions.",
  },
  {
    icon: Globe2,
    title: "Institution-scale",
    body: "From technical schools to multi-campus universities. Import students, structure faculties and departments, schedule exams and publish results.",
  },
  {
    icon: Lock,
    title: "Data protection",
    body: "Role-based access, encrypted transit, audit logs. Candidate and institutional data is used only to deliver examinations — never sold for advertising.",
  },
  {
    icon: Eye,
    title: "Officer visibility",
    body: "Live monitoring, integrity timelines and pause / terminate controls so officers can act in real time during high-stakes sittings.",
  },
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
        <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">
          Professional examination management for every institution
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground">
          D4EXAM is a professional examination management platform built for schools, colleges,
          polytechnics and universities. We help institutions move paper-based assessment online
          without losing the rigour, structure and accountability that academic examinations demand.
        </p>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-muted-foreground">
          From school application and academic structure setup, through question banks and secured
          CBT delivery, to marking, results release and officer oversight — D4EXAM is designed as a
          complete examination lifecycle system, not a single-purpose quiz tool.
        </p>

        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {values.map((v) => (
            <div key={v.title} className="surface-panel p-5">
              <h2 className="text-base font-semibold">{v.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{v.body}</p>
            </div>
          ))}
        </div>

        <h2 className="mt-14 text-2xl font-extrabold text-slate-900">What we stand for</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Six pillars that shape every product decision on the platform.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pillars.map((p) => (
            <div key={p.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-primary">
                <p.icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-base font-bold text-slate-900">{p.title}</h3>
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

        <div className="mt-14 rounded-2xl border border-slate-200 bg-slate-50/80 p-6 sm:p-8">
          <h2 className="text-lg font-bold text-slate-900">Our commitment</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            We build for academic reality: concurrent exam load, limited bandwidth, multi-role staff,
            and the need for results that can stand up to scrutiny. D4EXAM is actively maintained for
            schools across Africa and beyond, with continuous improvements to security, live monitoring
            and officer workflows.
          </p>
          <p className="mt-6 text-center text-xs text-slate-400">
            © 2026 D4EXAM. All rights reserved. · Smart. Secure. Seamless.
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
