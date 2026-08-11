import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/dashboard/kit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/application-status")({
  head: () => ({
    meta: [
      { title: "Application Status — D4EXAM" },
      { name: "description", content: "Track the verification progress of your D4EXAM school application using your reference number." },
      { property: "og:title", content: "Application Status — D4EXAM" },
      { property: "og:description", content: "Track your school application progress." },
    ],
  }),
  component: Page,
});

const timeline = [
  { title: "Application received", time: "Aug 9, 2026 · 10:12", done: true },
  { title: "Documents verified", time: "Aug 10, 2026 · 14:38", done: true },
  { title: "Compliance review", time: "In progress", done: false },
  { title: "Institution code issued", time: "Pending", done: false },
];

function Page() {
  const [checked, setChecked] = useState(false);

  return (
    <PublicLayout>
      <div className="mx-auto w-full max-w-2xl px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-extrabold sm:text-4xl">Application status</h1>
        <p className="mt-3 text-muted-foreground">
          Enter the reference number sent to your official email to see where your application is.
        </p>

        <form className="surface-panel mt-8 space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); setChecked(true); }}>
          <div className="space-y-2">
            <Label htmlFor="ref">Application reference</Label>
            <Input id="ref" required defaultValue="D4-APP-20268" placeholder="D4-APP-00000" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Official email</Label>
            <Input id="email" type="email" required placeholder="registry@school.edu" />
          </div>
          <Button type="submit">Check status</Button>
        </form>

        {checked && (
          <section className="surface-panel mt-6 p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Lagos Model College</h2>
                <p className="text-sm text-muted-foreground">Reference D4-APP-20268</p>
              </div>
              <StatusBadge status="under review" />
            </div>
            <ol className="mt-6 space-y-5">
              {timeline.map((t) => (
                <li key={t.title} className="flex gap-3">
                  <span className={cn("mt-1 h-3 w-3 shrink-0 rounded-full border-2", t.done ? "border-primary bg-primary" : "border-muted-foreground")} />
                  <div>
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">{t.time}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </PublicLayout>
  );
}
