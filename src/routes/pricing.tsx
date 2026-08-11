import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — D4EXAM" },
      {
        name: "description",
        content:
          "D4EXAM pricing for technical schools, colleges, polytechnics and universities.",
      },
    ],
  }),
  component: PricingPage,
});

const plans = [
  {
    name: "Starter",
    audience: "Technical schools & training centres",
    price: "₦45,000",
    period: "per term",
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
    features: [
      "Up to 5,000 active students",
      "Question bank & marking centre",
      "Live exam monitoring",
      "Examination officer workflow",
      "Student bulk import",
      "Priority support",
    ],
    highlight: true,
  },
  {
    name: "Enterprise",
    audience: "Universities & multi-campus systems",
    price: "Custom",
    period: "annual contract",
    features: [
      "Unlimited students & campuses",
      "SSO / API integration",
      "Dedicated success manager",
      "Custom SLA & onboarding",
      "Advanced analytics & audit",
      "On-premise option available",
    ],
  },
];

function PricingPage() {
  return (
    <PublicLayout>
      <section className="border-b border-slate-100 bg-white">
        <div className="mx-auto max-w-[1180px] px-4 py-14 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-3xl font-extrabold text-slate-900 sm:text-4xl">Pricing</h1>
            <p className="mt-3 text-slate-600">
              Plans sized for technical schools, colleges, polytechnics and universities. All plans
              include secure CBT delivery and role-based portals.
            </p>
          </div>

          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {plans.map((p) => (
              <div
                key={p.name}
                className={`flex flex-col rounded-2xl border p-6 shadow-sm ${
                  p.highlight
                    ? "border-primary bg-blue-50/40 ring-2 ring-primary/20"
                    : "border-slate-200 bg-white"
                }`}
              >
                <p className="text-sm font-semibold text-primary">{p.audience}</p>
                <h2 className="mt-1 text-2xl font-extrabold text-slate-900">{p.name}</h2>
                <p className="mt-4">
                  <span className="text-3xl font-extrabold text-slate-900">{p.price}</span>
                  <span className="ml-1 text-sm text-slate-500">{p.period}</span>
                </p>
                <ul className="mt-6 flex-1 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-8 w-full rounded-full font-semibold"
                  variant={p.highlight ? "default" : "outline"}
                  asChild
                >
                  <Link to={p.name === "Enterprise" ? "/support" : "/school-application"}>
                    {p.name === "Enterprise" ? "Contact Sales" : "Apply for this plan"}
                  </Link>
                </Button>
              </div>
            ))}
          </div>

          <div className="mt-12 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center sm:p-8">
            <h3 className="text-lg font-bold text-slate-900">Need a multi-campus university package?</h3>
            <p className="mt-2 text-sm text-slate-600">
              We design Enterprise contracts around student volume, concurrent exam load and campus
              structure.
            </p>
            <Button className="mt-5 rounded-full font-semibold" asChild>
              <Link to="/support">Talk to sales</Link>
            </Button>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
