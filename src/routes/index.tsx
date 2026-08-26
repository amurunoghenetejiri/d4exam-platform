import { createFileRoute, Link, redirect } from "@tanstack/react-router";
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
import { fetchSessionUser, roleHome } from "@/lib/session";

export const Route = createFileRoute("/")({
  ssr: false,
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
  beforeLoad: async () => {
    try {
      const user = await Promise.race([
        fetchSessionUser(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
      ]);
      if (user?.role && user.role in roleHome) {
        throw redirect({ to: roleHome[user.role] as never });
      }
    } catch (e) {
      if (e && typeof e === "object" && ("to" in e || (e as { isRedirect?: boolean }).isRedirect)) {
        throw e;
      }
    }
  },
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
  { value: "Live", label: "Institutions" },
  { value: "Secure", label: "CBT delivery" },
  { value: "Fast", label: "Results" },
  { value: "Global", label: "Access" },
];

const plans = [
  {
    name: "Starter",
    audience: "Technical schools & training centres",
    price: "₦45,000",
    period: "per term",
    highlight: false,
    features: [
      "Up to 500 active students",
      "Unlimited objective examinations",
      "Basic integrity monitoring",
      "Result export (CSV/PDF)",
      "Email support (48h)",
    ],
  },
  {
    name: "Professional",
    audience: "Colleges & polytechnics",
    price: "₦120,000",
    period: "per term",
    highlight: true,
    features: [
      "Up to 5,000 active students",
      "Essay + objective marking",
      "Live proctoring dashboard",
      "Custom branding",
      "Priority support",
    ],
  },
  {
    name: "Enterprise",
    audience: "Universities & multi-campus",
    price: "Custom",
    period: "annual",
    highlight: false,
    features: [
      "Unlimited students",
      "Dedicated success manager",
      "SSO & advanced integrations",
      "On-premise options",
      "SLA & training",
    ],
  },
];

function HomePage() {
  return (
    <PublicLayout>
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-24">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-blue-600">Smart · Secure · Seamless</p>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
              Examination management built for modern schools
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
              Run secure computer-based tests, protect integrity, mark automatically and publish results — all in one platform.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" className="rounded-full px-6 font-semibold" asChild>
                <Link to="/school-application">
                  Apply for your school <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="rounded-full px-6 font-semibold" asChild>
                <Link to="/login">Sign in</Link>
              </Button>
            </div>
            <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-center shadow-sm">
                  <p className="text-lg font-extrabold text-slate-900">{s.value}</p>
                  <p className="text-[11px] font-medium text-slate-500">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="relative hidden lg:block">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                Live integrity monitoring
              </div>
              <p className="mt-2 text-sm text-slate-500">
                Officers see candidate status, warnings and submission state in real time during examinations.
              </p>
              <div className="mt-6 space-y-3">
                {["Fullscreen lock", "Face presence checks", "Tab-switch alerts", "Auto submit on time"].map((x) => (
                  <div key={x} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                    <Check className="h-4 w-4 text-blue-600" />
                    {x}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-100 bg-white py-16">
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
          <h2 className="text-center text-2xl font-extrabold text-slate-900 sm:text-3xl">Why schools choose D4EXAM</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.title} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-600">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-base font-bold text-slate-900">{f.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-100 bg-slate-50 py-16">
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
          <h2 className="text-center text-2xl font-extrabold text-slate-900">How it works</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s) => (
              <div key={s.n} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-bold text-blue-600">{s.n}</p>
                <h3 className="mt-2 text-base font-bold text-slate-900">{s.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-100 bg-white py-16">
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
          <h2 className="text-center text-2xl font-extrabold text-slate-900">Security that protects every script</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {security.map((s) => (
              <div key={s.title} className="rounded-2xl border border-slate-200 p-5">
                <s.icon className="h-6 w-6 text-blue-600" />
                <h3 className="mt-3 text-base font-bold text-slate-900">{s.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-100 bg-slate-50 py-16">
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
          <h2 className="text-center text-2xl font-extrabold text-slate-900">Built for every role</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {roles.map((r) => (
              <div key={r.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <r.icon className="h-6 w-6 text-blue-600" />
                <h3 className="mt-3 text-base font-bold text-slate-900">{r.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-100 bg-white py-16" id="pricing">
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
          <h2 className="text-center text-2xl font-extrabold text-slate-900">Simple pricing</h2>
          <p className="mx-auto mt-2 max-w-lg text-center text-sm text-slate-600">
            Choose a plan that matches your institution. Custom enterprise available.
          </p>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {plans.map((p) => (
              <div
                key={p.name}
                className={`rounded-2xl border p-6 shadow-sm ${
                  p.highlight ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200"
                }`}
              >
                <h3 className="text-lg font-extrabold text-slate-900">{p.name}</h3>
                <p className="mt-1 text-xs font-medium text-slate-500">{p.audience}</p>
                <p className="mt-4 text-3xl font-extrabold text-slate-900">
                  {p.price}
                  <span className="text-sm font-medium text-slate-500"> / {p.period}</span>
                </p>
                <ul className="mt-5 space-y-2">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2 text-sm text-slate-700">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button className="mt-6 w-full font-semibold" variant={p.highlight ? "default" : "outline"} asChild>
                  <Link to="/school-application">Get started</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-100 bg-[#0b1b3a] py-14 text-white">
        <div className="mx-auto max-w-[1180px] px-4 text-center sm:px-6">
          <h2 className="text-2xl font-extrabold">Ready to modernise your examinations?</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-slate-300">
            Apply for your institution today. Setup support included for every plan.
          </p>
          <Button size="lg" className="mt-6 rounded-full bg-white px-8 font-semibold text-slate-900 hover:bg-slate-100" asChild>
            <Link to="/school-application">Apply now</Link>
          </Button>
        </div>
      </section>
    </PublicLayout>
  );
}
