import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ShieldCheck,
  Gauge,
  BarChart3,
  Globe2,
  Lock,
  Eye,
  FileCheck2,
  Users,
  GraduationCap,
  ClipboardCheck,
  Building2,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "D4EXAM — Smart, Secure Online Examination Platform for Schools" },
      {
        name: "description",
        content:
          "D4EXAM lets schools, colleges and universities conduct secure CBT examinations, manage students, build question banks, automate marking and publish results.",
      },
      { property: "og:title", content: "D4EXAM — Secure Online Examination Platform" },
      {
        property: "og:description",
        content:
          "Conduct exams, manage students, create questions, automate marking and publish results seamlessly.",
      },
    ],
  }),
  component: HomePage,
});

const features = [
  {
    icon: ShieldCheck,
    title: "Secure & Reliable",
    body: "Fullscreen lockdown, tab monitoring and integrity logging protect every examination session.",
  },
  {
    icon: Gauge,
    title: "Easy to Use",
    body: "A calm, consistent interface for students, teachers and administrators on any device.",
  },
  {
    icon: BarChart3,
    title: "Powerful Analytics",
    body: "Grade distributions, participation rates and performance reports for better decisions.",
  },
  {
    icon: Globe2,
    title: "Anywhere Access",
    body: "Run examinations across campuses and countries with resilient, low-bandwidth delivery.",
  },
];

const steps = [
  {
    n: "01",
    title: "Register your institution",
    body: "Submit a school application, get verified and receive your unique institution code.",
  },
  {
    n: "02",
    title: "Set up academics",
    body: "Import students, create faculties, departments, levels, courses and academic sessions.",
  },
  {
    n: "03",
    title: "Build examinations",
    body: "Create question banks, schedule exams and configure security and result settings.",
  },
  {
    n: "04",
    title: "Deliver and publish",
    body: "Candidates sit the CBT, marking is automated, officers approve and results go live.",
  },
];

const security = [
  { icon: Lock, title: "Fullscreen lockdown", body: "Candidates are kept inside the examination window." },
  { icon: Eye, title: "Tab & focus monitoring", body: "Every switch is recorded against a configurable threshold." },
  { icon: FileCheck2, title: "Randomised delivery", body: "Question and option shuffling reduces collusion." },
  { icon: ShieldCheck, title: "Integrity timeline", body: "Officers review a full audit trail per attempt." },
];

const roles = [
  { icon: GraduationCap, title: "Students", body: "Sit examinations, track courses and view approved results." },
  { icon: Users, title: "Teachers", body: "Build question banks, create exams, mark and release scores." },
  { icon: Building2, title: "School Admins", body: "Manage users, academics, examinations and institutional reports." },
  { icon: ClipboardCheck, title: "Exam Officers", body: "Approve exams, monitor live sessions and review integrity." },
];

const stats = [
  { value: "182+", label: "Institutions" },
  { value: "84K+", label: "Students" },
  { value: "12K+", label: "Examinations" },
  { value: "98.5%", label: "Success Rate" },
];

function HomePage() {
  return (
    <PublicLayout>
      {/* Hero */}
      <section className="border-b border-border">
        <div className="mx-auto grid w-full max-w-[1200px] items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              Trusted examination infrastructure
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] sm:text-5xl lg:text-[3.4rem]">
              Smart Examination <span className="brand-gradient-text">Management</span> for Every
              Institution
            </h1>
            <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
              Conduct computer-based examinations, manage students, create questions, automate
              marking and publish results seamlessly — from one secure platform.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link to="/school-application">
                  Get Started
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/login">School Login</Link>
              </Button>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {["No installation required", "Works on low bandwidth", "Institution-grade security"].map(
                (i) => (
                  <li key={i} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
                    {i}
                  </li>
                ),
              )}
            </ul>
          </div>

          <div className="surface-panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">CSC101 — First Semester Examination</p>
              <span className="rounded-md bg-primary/12 px-2 py-1 font-mono text-xs font-semibold text-primary">
                00:47:32
              </span>
            </div>
            <div className="p-4 sm:p-5">
              <p className="text-xs text-muted-foreground">Question 18 of 50</p>
              <p className="mt-2 text-base font-semibold">What is a variable in programming?</p>
              <ul className="mt-4 space-y-2.5">
                {[
                  "A fixed value that cannot change",
                  "A named storage location that holds a value",
                  "An operating system service",
                  "A network transmission protocol",
                ].map((o, i) => (
                  <li
                    key={o}
                    className={`rounded-lg border px-3 py-2.5 text-sm ${
                      i === 1
                        ? "border-primary/50 bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {String.fromCharCode(65 + i)}. {o}
                  </li>
                ))}
              </ul>
              <div className="mt-5 grid grid-cols-10 gap-1.5">
                {Array.from({ length: 30 }).map((_, i) => (
                  <span
                    key={i}
                    className={`grid h-6 place-items-center rounded text-[10px] font-semibold ${
                      i < 17
                        ? "bg-primary/15 text-primary"
                        : i === 17
                          ? "bg-primary text-primary-foreground"
                          : i % 7 === 0
                            ? "bg-warning/15 text-warning"
                            : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {i + 1}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature strip */}
      <section className="border-b border-border bg-surface/40">
        <div className="mx-auto grid w-full max-w-[1200px] gap-4 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="surface-panel p-5">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/12 text-primary">
                <f.icon className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="mt-4 text-base font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto grid w-full max-w-[1200px] grid-cols-2 gap-6 px-4 py-10 sm:px-6 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="font-display text-3xl font-extrabold text-primary sm:text-4xl">
                {s.value}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-bold sm:text-3xl">How D4EXAM works</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            From institutional onboarding to published results, every stage is structured, auditable
            and built for academic workflows.
          </p>
          <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s) => (
              <li key={s.n} className="surface-panel p-5">
                <span className="font-display text-sm font-bold text-primary">{s.n}</span>
                <h3 className="mt-3 text-base font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Security */}
      <section className="border-b border-border bg-surface/40">
        <div className="mx-auto grid w-full max-w-[1200px] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className="text-2xl font-bold sm:text-3xl">Examination integrity by design</h2>
            <p className="mt-3 text-muted-foreground">
              Every attempt is monitored, recorded and reviewable. Institutions decide how strict
              each examination should be, and officers get a full evidence trail before results are
              approved.
            </p>
            <Button className="mt-6" variant="outline" asChild>
              <Link to="/features">Explore all features</Link>
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {security.map((s) => (
              <div key={s.title} className="surface-panel p-5">
                <s.icon className="h-5 w-5 text-aqua" aria-hidden />
                <h3 className="mt-3 text-sm font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Roles */}
      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-bold sm:text-3xl">One platform, every role</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {roles.map((r) => (
              <div key={r.title} className="surface-panel p-5">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-aqua/12 text-aqua">
                  <r.icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-base font-semibold">{r.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="mx-auto w-full max-w-[1200px] px-4 py-16 sm:px-6">
          <div className="surface-panel flex flex-col items-start gap-6 bg-gradient-to-br from-primary/12 via-surface to-surface p-8 sm:p-12 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-bold sm:text-3xl">
                Bring your examinations online — properly.
              </h2>
              <p className="mt-2 max-w-xl text-muted-foreground">
                Apply as an institution today and get a guided onboarding session with the D4EXAM
                academic team.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link to="/school-application">Apply Now</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/support">Contact Support</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
