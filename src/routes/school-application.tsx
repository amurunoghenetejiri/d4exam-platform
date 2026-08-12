import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/school-application")({
  head: () => ({
    meta: [
      { title: "Apply Your School — D4EXAM" },
      {
        name: "description",
        content:
          "Register your school, college or university on D4EXAM and start conducting secure online examinations.",
      },
    ],
  }),
  component: Page,
});

const steps = ["Institution", "Contact Person", "Details", "Review"];

function Page() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refId, setRefId] = useState("");

  const [schoolName, setSchoolName] = useState("");
  const [schoolType, setSchoolType] = useState("university");
  const [country, setCountry] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [officialEmail, setOfficialEmail] = useState("");
  const [officialPhone, setOfficialPhone] = useState("");

  const [applicantName, setApplicantName] = useState("");
  const [applicantEmail, setApplicantEmail] = useState("");
  const [applicantPhone, setApplicantPhone] = useState("");
  const [notes, setNotes] = useState("");

  async function submitApplication() {
    setError("");
    setLoading(true);
    try {
      const { data, error: insertError } = await supabase
        .from("school_applications")
        .insert({
          school_name: schoolName.trim(),
          school_type: schoolType,
          country: country.trim() || null,
          state: state.trim() || null,
          city: city.trim() || null,
          address: address.trim() || null,
          official_email: officialEmail.trim(),
          official_phone: officialPhone.trim() || null,
          applicant_name: applicantName.trim(),
          applicant_email: applicantEmail.trim(),
          applicant_phone: applicantPhone.trim() || null,
          review_notes: notes.trim() || null,
          status: "pending",
        })
        .select("id")
        .single();

      if (insertError) {
        setError(insertError.message || "Could not submit application. Please try again.");
        return;
      }
      setRefId(data.id);
    } catch {
      setError("Could not submit application. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function onFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step < steps.length - 1) {
      setStep((s) => s + 1);
      return;
    }
    await submitApplication();
  }

  if (refId) {
    return (
      <PublicLayout>
        <div className="mx-auto w-full max-w-xl px-4 py-20 sm:px-6">
          <Alert className="border-primary/30 bg-primary/10">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <AlertTitle>Application submitted</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                Your application was saved. Reference ID:{" "}
                <strong className="break-all">{refId}</strong>
              </p>
              <p>
                Use your official applicant email on the{" "}
                <Link to="/application-status" className="font-semibold text-primary underline">
                  Application Status
                </Link>{" "}
                page. A super admin will review it from the platform dashboard.
              </p>
            </AlertDescription>
          </Alert>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-extrabold text-slate-900 sm:text-4xl">School application</h1>
        <p className="mt-3 text-slate-600">
          Apply for your institution. After approval you receive a school code and admin access.
        </p>

        <ol className="mt-8 grid grid-cols-4 gap-2" aria-label="Application progress">
          {steps.map((s, i) => (
            <li key={s} className="min-w-0">
              <div className={cn("h-1 rounded-full", i <= step ? "bg-primary" : "bg-slate-200")} />
              <p
                className={cn(
                  "mt-2 truncate text-xs font-medium",
                  i <= step ? "text-primary" : "text-slate-400",
                )}
              >
                {i + 1}. {s}
              </p>
            </li>
          ))}
        </ol>

        <form className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={onFormSubmit}>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === 0 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="iname">Institution name</Label>
                <Input id="iname" required value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="Institution name" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="itype">Institution type</Label>
                  <Select value={schoolType} onValueChange={setSchoolType}>
                    <SelectTrigger id="itype"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="university">University</SelectItem>
                      <SelectItem value="polytechnic">Polytechnic</SelectItem>
                      <SelectItem value="college">College</SelectItem>
                      <SelectItem value="secondary">Secondary School</SelectItem>
                      <SelectItem value="technical">Technical school</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input id="country" required value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State / region</Label>
                  <Input id="state" value={state} onChange={(e) => setState(e.target.value)} placeholder="State" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="addr">Campus address</Label>
                <Textarea id="addr" rows={3} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="oemail">Official school email</Label>
                  <Input id="oemail" type="email" required value={officialEmail} onChange={(e) => setOfficialEmail(e.target.value)} placeholder="info@school.edu" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ophone">Official phone</Label>
                  <Input id="ophone" type="tel" value={officialPhone} onChange={(e) => setOfficialPhone(e.target.value)} placeholder="Phone" />
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="cname">Applicant full name</Label>
                <Input id="cname" required value={applicantName} onChange={(e) => setApplicantName(e.target.value)} placeholder="Full name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cemail">Applicant email</Label>
                <Input id="cemail" type="email" required value={applicantEmail} onChange={(e) => setApplicantEmail(e.target.value)} placeholder="you@school.edu" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cphone">Applicant phone</Label>
                <Input id="cphone" type="tel" value={applicantPhone} onChange={(e) => setApplicantPhone(e.target.value)} placeholder="Phone" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-2">
              <Label htmlFor="need">What do you need D4EXAM for?</Label>
              <Textarea id="need" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Semester exams, continuous assessment, entrance screening…" />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p><strong>School:</strong> {schoolName || "—"} ({schoolType})</p>
              <p><strong>Location:</strong> {[city, state, country].filter(Boolean).join(", ") || "—"}</p>
              <p><strong>Official email:</strong> {officialEmail || "—"}</p>
              <p><strong>Applicant:</strong> {applicantName || "—"} · {applicantEmail || "—"}</p>
              <p className="text-slate-500">
                By submitting you confirm the details are accurate and you are authorised to apply for this institution.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button type="button" variant="outline" disabled={step === 0 || loading} onClick={() => setStep((s) => s - 1)}>
              Previous
            </Button>
            <Button type="submit" disabled={loading} className="font-semibold">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {step === steps.length - 1 ? "Submit application" : "Continue"}
            </Button>
          </div>
        </form>
      </div>
    </PublicLayout>
  );
}
