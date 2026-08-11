import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/school-application")({
  head: () => ({
    meta: [
      { title: "Apply Your School — D4EXAM" },
      { name: "description", content: "Register your school, college or university on D4EXAM and start conducting secure online examinations." },
      { property: "og:title", content: "Apply Your School — D4EXAM" },
      { property: "og:description", content: "Institutional onboarding for secure CBT examinations." },
    ],
  }),
  component: Page,
});

const steps = ["Institution", "Contact Person", "Requirements", "Review"];

function Page() {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <PublicLayout>
        <div className="mx-auto w-full max-w-xl px-4 py-20 sm:px-6">
          <Alert className="border-primary/30 bg-primary/10">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <AlertTitle>Application submitted</AlertTitle>
            <AlertDescription>
              Your reference number is <strong>D4-APP-20268</strong>. Track progress on the
              Application Status page. Verification typically takes 2-3 working days.
            </AlertDescription>
          </Alert>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-extrabold sm:text-4xl">School application</h1>
        <p className="mt-3 text-muted-foreground">
          Tell us about your institution. Once verified you'll receive your D4EXAM institution code
          and administrator credentials.
        </p>

        <ol className="mt-8 grid grid-cols-4 gap-2" aria-label="Application progress">
          {steps.map((s, i) => (
            <li key={s} className="min-w-0">
              <div className={cn("h-1 rounded-full", i <= step ? "bg-primary" : "bg-muted")} />
              <p className={cn("mt-2 truncate text-xs font-medium", i <= step ? "text-primary" : "text-muted-foreground")}>
                {i + 1}. {s}
              </p>
            </li>
          ))}
        </ol>

        <form
          className="surface-panel mt-8 space-y-4 p-6"
          onSubmit={(e) => { e.preventDefault(); step === steps.length - 1 ? setDone(true) : setStep((s) => s + 1); }}
        >
          {step === 0 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="iname">Institution name</Label>
                <Input id="iname" required placeholder="Example State University" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="itype">Institution type</Label>
                  <Select defaultValue="university">
                    <SelectTrigger id="itype"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="university">University</SelectItem>
                      <SelectItem value="polytechnic">Polytechnic</SelectItem>
                      <SelectItem value="college">College</SelectItem>
                      <SelectItem value="secondary">Secondary School</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input id="country" required placeholder="Nigeria" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="addr">Campus address</Label>
                <Textarea id="addr" rows={3} placeholder="Main campus address" />
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="cname">Full name</Label><Input id="cname" required placeholder="Grace Okonkwo" /></div>
                <div className="space-y-2"><Label htmlFor="crole">Role</Label><Input id="crole" required placeholder="Registrar" /></div>
                <div className="space-y-2"><Label htmlFor="cemail">Official email</Label><Input id="cemail" type="email" required placeholder="registry@school.edu" /></div>
                <div className="space-y-2"><Label htmlFor="cphone">Phone</Label><Input id="cphone" type="tel" required placeholder="+234 800 000 0000" /></div>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="students">Approximate students</Label><Input id="students" type="number" placeholder="12000" /></div>
                <div className="space-y-2"><Label htmlFor="staff">Approximate teaching staff</Label><Input id="staff" type="number" placeholder="480" /></div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="need">What do you need D4EXAM for?</Label>
                <Textarea id="need" rows={4} placeholder="Semester examinations, continuous assessment, entrance screening…" />
              </div>
            </>
          )}
          {step === 3 && (
            <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
              Confirm that the details provided are accurate and that you are authorised to apply on
              behalf of your institution. A verification officer will contact you by email.
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
              Previous
            </Button>
            <Button type="submit">{step === steps.length - 1 ? "Submit application" : "Continue"}</Button>
          </div>
        </form>
      </div>
    </PublicLayout>
  );
}
