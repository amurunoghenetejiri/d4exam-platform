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
  Check,
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
    ],
  }),
  component: HomePage,
});

const features = [
  { icon: ShieldCheck, title: "Secure & Reliable", body: "Advanced security features to ensure exam integrity." },
  { icon: Gauge, title: "Easy to Use", body: "Simple interface for teachers, students and admins." },
  { icon: BarChart3, title: "Powerful Analytics", body: "Detailed reports and analytics for better decisions." },
  { icon: Globe2, title: "Anywhere Access", body: "Access the platform from any device, anytime." },
];

const steps = [
  { n: "01", title: "Register your institution", body: "Submit a school application and receive your institution code." },
  { n: "02", title: "Set up academics", body: "Import students, faculties, departments, levels and courses." },
  { n: "03", title: "Build examinations", body: "Create question banks, schedule exams and set security rules." },
  { n: "04", title: "Deliver and publish", body: "Candidates sit CBT, marking is automated and results go live." },
];

const security = [
  { icon: Lock, title: "Fullscreen lockdown", body: "Candidates stay inside the examination window." },
  { icon: Eye, title: "Tab & focus monitoring", body: "Every switch is recorded against a threshold." },
  { icon: FileCheck2, title: "Randomised delivery", body: "Question and option shuffling reduces collusion." },
  { icon: ShieldCheck, title: "Integrity timeline", body: "Officers review a full audit trail per attempt." },
];

const roles = [
  { icon: GraduationCap, title: "Students", body: "Sit examinations, track courses and view results." },
  { icon: Users, title: "Teachers", body: "Build question banks, create exams and mark scripts." },
  { icon: Building2, title: "School Admins", body: "Manage users, academics and institutional reports." },
  { icon: ClipboardCheck, title: "Exam Officers", body: "Approve exams, monitor live sessions and integrity." },
];

const stats = [
  { value: "182+", label: "Institutions" },
  { value: "84K+", label: "Students" },
  { value: "12K+", label: "Examinations" },
  { value: "98.5%", label: "Success Rate" },
];

const plans = [
  {
    name: "Starter",
    audience: "Technical schools & academies",
    price: "₦45,000",
    period: "/term",
    features: ["Up to 500 students", "Unlimited MCQ exams", "Basic integrity logs", "Email support"],
    cta: "Get Started",
    highlight: false,
  },
  {
    name: "Professional",
    audience: "Colleges & polytechnics",
    price: "₦120,000",
    period: "/term",
    features: [
      "Up to 5,000 students",
      "Question bank & marking center",
      "Live monitoring",
      "Officer approvals",
      "Priority support",
    ],
    cta: "Choose Professional",
    highlight: true,
  },
  {
    name: "Enterprise",
    audience: "Universities & multi-campus",
    price: "Custom",
    period: "",
    features: [
      "Unlimited students",
      "Multi-campus hierarchy",
      "SSO & API access",
      "Dedicated success manager",
      "SLA & onboarding",
    ],
    cta: "Contact Sales",
    highlight: false,
  },
];

function HomePage() {
  return (
    <PublicLayout>
      {/* Full-width hero image with overlay content */}
      <section className="relative min-h-[min(88vh,720px)] w-full overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1920&q=85"
          alt="Students using laptops for online examination"
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b1b3a]/95 via-[#0b1b3a]/75 to-[#0b1b3a]/40" />
        <div className="relative mx-auto flex min-h-[min(88vh,720px)] w-full max-w-[1180px] items-center px-4 py-16 sm:px-6">
          <div className="max-w-2xl text-white">
            <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-blue-200">
              Smart. Secure. Seamless.
            </p>
            <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl lg:text-5xl">
              Smart Examination Management for Every Institution
            </h1>
            <p className="mt-4 text-base leading-relaxed text-slate-200 sm:text-lg">
              Conduct exams, manage students, create questions, automate marking and publish results
              seamlessly — for universities, polytechnics, colleges and technical schools.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" className="rounded-full px-7 font-semibold" asChild>
                <Link to="/school-application">
                  Get Started
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="rounded-full border-white/40 bg-white/10 px-7 font-semibold text-white hover:bg-white/20 hover:text-white"
                asChild
              >
                <Link to="/pricing">View Pricing</Link>
              </Button>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-200">
              {["No installation required", "Works on low bandwidth", "Institution-grade security"].map(
                (i) => (
                  <li key={i} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-300" />
                    {i}
                  </li>
                ),
              )}
            </ul>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-100 bg-slate-50/80">
        <div className="mx-auto grid w-full max-w-[1180px] gap-4 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-primary">
                <f.icon className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-base font-bold text-slate-900">{f.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-b border-slate-100 bg-[#0b1b3a] text-white">
        <div className="mx-auto grid w-full max-w-[1180px] grid-cols-2 gap-6 px-4 py-10 sm:px-6 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-3xl font-extrabold sm:text-4xl">{s.value}</p>
              <p className="mt-1 text-sm text-slate-300">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing preview */}
      <section id="pricing" className="border-b border-slate-100 bg-white">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-14 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">Pricing for every institution</h2>
            <p className="mt-2 text-slate-600">
              Transparent plans for technical schools, colleges, polytechnics and universities.
            </p>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {plans.map((p) => (
              <div
                key={p.name}
                className={`rounded-2xl border p-6 shadow-sm ${
                  p.highlight
                    ? "border-primary bg-blue-50/40 ring-2 ring-primary/20"
                    : "border-slate-200 bg-white"
                }`}
              >
                <p className="text-sm font-semibold text-primary">{p.audience}</p>
                <h3 className="mt-1 text-xl font-extrabold text-slate-900">{p.name}</h3>
                <p className="mt-3">
                  <span className="text-3xl font-extrabold text-slate-900">{p.price}</span>
                  <span className="text-sm text-slate-500">{p.period}</span>
                </p>
                <ul className="mt-5 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className={`mt-6 w-full rounded-full font-semibold ${
                    p.highlight ? "" : ""
                  }`}
                  variant={p.highlight ? "default" : "outline"}
                  asChild
                >
                  <Link to={p.name === "Enterprise" ? "/support" : "/school-application"}>{p.cta}</Link>
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-slate-500">
            Need a custom quote?{" "}
            <Link to="/pricing" className="font-semibold text-primary hover:underline">
              See full pricing details
            </Link>
          </p>
        </div>
      </section>

      <section className="border-b border-slate-100 bg-white">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">How D4EXAM works</h2>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s) => (
              <li key={s.n} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <span className="text-sm font-extrabold text-primary">{s.n}</span>
                <h3 className="mt-3 text-base font-bold text-slate-900">{s.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-b border-slate-100 bg-slate-50/80">
        <div className="mx-auto grid w-full max-w-[1180px] gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">
              Examination integrity by design
            </h2>
            <p className="mt-3 text-slate-600">
              Every attempt is monitored, recorded and reviewable.
            </p>
            <Button className="mt-6 rounded-full font-semibold" variant="outline" asChild>
              <Link to="/features">Explore all features</Link>
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {security.map((s) => (
              <div key={s.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <s.icon className="h-5 w-5 text-primary" />
                <h3 className="mt-3 text-sm font-bold text-slate-900">{s.title}</h3>
                <p className="mt-1.5 text-sm text-slate-600">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-slate-100 bg-white">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">One platform, every role</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {roles.map((r) => (
              <div key={r.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-primary">
                  <r.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-base font-bold text-slate-900">{r.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-14 sm:px-6">
          <div className="flex flex-col items-start gap-6 rounded-2xl border border-blue-100 bg-blue-50/60 p-8 sm:p-10 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">
                Bring your examinations online — properly.
              </h2>
              <p className="mt-2 max-w-xl text-slate-600">
                Apply as an institution today and get guided onboarding with the D4EXAM team.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
              <Button size="lg" className="rounded-full px-6 font-semibold" asChild>
                <Link to="/school-application">Apply Now</Link>
              </Button>
              <Button size="lg" variant="outline" className="rounded-full px-6 font-semibold" asChild>
                <Link to="/support">Contact Support</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
