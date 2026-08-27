import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { uploadSchoolLogo, validateLogoFile } from "@/lib/school-identity";
import { notifySuperAdminsOfApplication } from "@/lib/notify-super-admin-application";

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

const TRACK_KEY = "d4exam_school_application_track";
const DRAFT_KEY = "d4exam_school_application_draft";

function makeTrackingCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "D4";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

const steps = ["Institution", "Contact Person", "Details", "Review"];

async function notifySuperAdmins(schoolName: string, applicationId: string) {
  try {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "super_admin");
    const ids = [...new Set((roles ?? []).map((r) => r.user_id).filter(Boolean))];
    if (ids.length === 0) return;
    await supabase.from("notifications").insert(
      ids.map((uid) => ({
        recipient_user_id: uid,
        title: "New school application",
        message: `${schoolName} submitted an application (ref ${applicationId}). Review it under Applications.`,
        type: "school_application",
        link: "/super-admin/applications",
        action_url: "/super-admin/applications",
      })),
    );
  } catch {
    // best-effort
  }
}

function Page() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refId, setRefId] = useState("");
  const [trackingCode, setTrackingCode] = useState("");

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
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const trackRaw = localStorage.getItem(TRACK_KEY);
      if (trackRaw) {
        const track = JSON.parse(trackRaw) as { id?: string; trackingCode?: string };
        if (track.trackingCode) setTrackingCode(track.trackingCode);
        if (track.id) setRefId(track.id);
      }
    } catch {
      /* ignore */
    }
    try {
      const draftRaw = localStorage.getItem(DRAFT_KEY);
      if (draftRaw) {
        const d = JSON.parse(draftRaw) as Record<string, string>;
        if (d.schoolName) setSchoolName(d.schoolName);
        if (d.schoolType) setSchoolType(d.schoolType);
        if (d.country) setCountry(d.country);
        if (d.state) setState(d.state);
        if (d.city) setCity(d.city);
        if (d.address) setAddress(d.address);
        if (d.officialEmail) setOfficialEmail(d.officialEmail);
        if (d.officialPhone) setOfficialPhone(d.officialPhone);
        if (d.applicantName) setApplicantName(d.applicantName);
        if (d.applicantEmail) setApplicantEmail(d.applicantEmail);
        if (d.applicantPhone) setApplicantPhone(d.applicantPhone);
        if (d.notes) setNotes(d.notes);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          schoolName,
          schoolType,
          country,
          state,
          city,
          address,
          officialEmail,
          officialPhone,
          applicantName,
          applicantEmail,
          applicantPhone,
          notes,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [
    schoolName,
    schoolType,
    country,
    state,
    city,
    address,
    officialEmail,
    officialPhone,
    applicantName,
    applicantEmail,
    applicantPhone,
    notes,
  ]);

  function onLogoPick(f: File | null) {
    if (!f) return;
    const err = validateLogoFile(f);
    if (err) {
      setError(err);
      return;
    }
    setError("");
    setLogoFile(f);
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      if (result.startsWith("data:")) setLogoPreview(result);
    };
    reader.onerror = () => setLogoPreview(null);
    reader.readAsDataURL(f);
  }

  async function submitApplication() {
    setError("");
    if (!logoFile) {
      setError("Please upload your official school logo (PNG, JPG or WebP).");
      return;
    }
    if (!schoolName.trim() || !applicantName.trim() || !applicantEmail.trim()) {
      setError("School name, applicant name and email are required.");
      return;
    }

    setLoading(true);
    try {
      const folder = `applications/${Date.now()}`;
      let logoUrl: string | null = null;
      try {
        const uploaded = await uploadSchoolLogo({ file: logoFile, folder });
        logoUrl = uploaded?.url || null;
      } catch (logoErr) {
        console.warn("[school-application] logo upload failed:", logoErr);
        const msg =
          logoErr instanceof Error
            ? logoErr.message
            : "Could not process the logo. Use a clear PNG or JPG under 2MB.";
        setError(msg);
        setLoading(false);
        return;
      }
      if (!logoUrl) {
        setError("Logo upload did not return a usable image. Try a smaller PNG or JPG.");
        setLoading(false);
        return;
      }

      const code = makeTrackingCode();
      const { data, error: insertError } = await supabase
        .from("school_applications")
        .insert({
          school_name: schoolName.trim(),
          school_type: schoolType,
          country: country.trim() || null,
          state: state.trim() || null,
          city: city.trim() || null,
          address: address.trim() || null,
          official_email: officialEmail.trim() || null,
          official_phone: officialPhone.trim() || null,
          applicant_name: applicantName.trim(),
          applicant_email: applicantEmail.trim(),
          applicant_phone: applicantPhone.trim() || null,
          notes: notes.trim() || null,
          tracking_code: code,
          status: "pending",
          documents: { logo_url: logoUrl } as never,
        })
        .select("id, tracking_code")
        .single();

      if (insertError || !data?.id) {
        setError(insertError?.message || "Could not submit application. Please try again.");
        setLoading(false);
        return;
      }

      const savedCode = (data as { tracking_code?: string }).tracking_code || code;
      setRefId(data.id);
      setTrackingCode(savedCode);
      try {
        localStorage.setItem(
          TRACK_KEY,
          JSON.stringify({ id: data.id, trackingCode: savedCode, email: applicantEmail.trim() }),
        );
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }

      void notifySuperAdmins(schoolName.trim(), data.id);
      try {
        void notifySuperAdminsOfApplication(schoolName.trim(), data.id as string, savedCode);
      } catch {
        /* best-effort */
      }
    } catch (err) {
      setError((err as Error).message || "Could not submit application.");
    } finally {
      setLoading(false);
    }
  }

  function next() {
    setError("");
    if (step === 0 && !logoFile) {
      setError("School logo is required.");
      return;
    }
    if (step < steps.length - 1) {
      setStep((s) => s + 1);
    } else {
      void submitApplication();
    }
  }

  function back() {
    setError("");
    setStep((s) => Math.max(0, s - 1));
  }

  if (refId && trackingCode) {
    return (
      <PublicLayout>
        <div className="mx-auto max-w-lg space-y-4 px-4 py-12 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <h1 className="text-2xl font-extrabold text-slate-900">Application submitted</h1>
          <p className="text-sm text-slate-600">
            Keep your reference code. Use it on the application status page to track review.
          </p>
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-mono text-lg font-bold text-emerald-900">
            {trackingCode || refId}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button asChild className="font-semibold">
              <Link to="/application-status">Check application status</Link>
            </Button>
            <Button asChild variant="outline" className="font-semibold">
              <Link to="/login">Go to login</Link>
            </Button>
          </div>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="mx-auto max-w-xl space-y-6 px-4 py-10">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Apply for your school</h1>
          <p className="mt-1 text-sm text-slate-500">
            Complete the short steps below. Your official logo is required.
          </p>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {steps.map((s, i) => (
            <div key={s} className="space-y-1">
              <div className={cn("h-1 rounded-full", i <= step ? "bg-primary" : "bg-slate-200")} />
              <p
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wide sm:text-xs",
                  i <= step ? "text-primary" : "text-slate-400",
                )}
              >
                {s}
              </p>
            </div>
          ))}
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Check this</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {step === 0 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="schoolName">School name</Label>
                <Input
                  id="schoolName"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  className="h-11"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Official school logo <span className="text-red-500">*</span>
                </Label>
                <input
                  ref={logoRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                  onChange={(e) => onLogoPick(e.target.files?.[0] ?? null)}
                />
                <div className="flex items-center gap-3">
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="Logo preview"
                      className="h-16 w-16 rounded-lg object-contain border border-slate-200 bg-transparent"
                    />
                  ) : (
                    <div className="grid h-16 w-16 place-items-center rounded-lg bg-slate-100 text-slate-400">
                      <Upload className="h-5 w-5" />
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className="font-semibold"
                    onClick={() => logoRef.current?.click()}
                  >
                    {logoFile ? "Change logo" : "Upload logo"}
                  </Button>
                </div>
                <p className="text-xs text-slate-500">
                  Upload your official school logo with a transparent background (PNG preferred). JPG or WebP also accepted. Max 2MB.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>School type</Label>
                <Select value={schoolType} onValueChange={setSchoolType}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="university">University</SelectItem>
                    <SelectItem value="polytechnic">Polytechnic</SelectItem>
                    <SelectItem value="college">College</SelectItem>
                    <SelectItem value="secondary">Secondary school</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="country">Country</Label>
                  <Input id="country" value={country} onChange={(e) => setCountry(e.target.value)} className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="state">State</Label>
                  <Input id="state" value={state} onChange={(e) => setState(e.target.value)} className="h-11" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="city">City</Label>
                <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="address">Address</Label>
                <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} className="h-11" />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="applicantName">Full name</Label>
                <Input
                  id="applicantName"
                  value={applicantName}
                  onChange={(e) => setApplicantName(e.target.value)}
                  className="h-11"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="applicantEmail">Email</Label>
                <Input
                  id="applicantEmail"
                  type="email"
                  value={applicantEmail}
                  onChange={(e) => setApplicantEmail(e.target.value)}
                  className="h-11"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="applicantPhone">Phone</Label>
                <Input
                  id="applicantPhone"
                  value={applicantPhone}
                  onChange={(e) => setApplicantPhone(e.target.value)}
                  className="h-11"
                />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="officialEmail">Official school email</Label>
                <Input
                  id="officialEmail"
                  type="email"
                  value={officialEmail}
                  onChange={(e) => setOfficialEmail(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="officialPhone">Official school phone</Label>
                <Input
                  id="officialPhone"
                  value={officialPhone}
                  onChange={(e) => setOfficialPhone(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </div>
            </>
          )}

          {step === 3 && (
            <div className="space-y-3 text-sm text-slate-700">
              <p>
                <span className="font-semibold">School:</span> {schoolName || "—"} ({schoolType})
              </p>
              <p>
                <span className="font-semibold">Location:</span>{" "}
                {[city, state, country].filter(Boolean).join(", ") || "—"}
              </p>
              <p>
                <span className="font-semibold">Contact:</span> {applicantName || "—"} ·{" "}
                {applicantEmail || "—"}
              </p>
              <div className="flex items-center gap-3">
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="Logo"
                    className="h-12 w-12 rounded-lg object-contain border border-slate-200 bg-transparent"
                  />
                ) : null}
                <span className="font-semibold">{logoFile ? logoFile.name : "No logo"}</span>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {step > 0 ? (
              <Button type="button" variant="outline" className="font-semibold" onClick={back} disabled={loading}>
                Back
              </Button>
            ) : null}
            <Button type="button" className="h-11 flex-1 font-semibold" onClick={next} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…
                </>
              ) : step === steps.length - 1 ? (
                "Submit application"
              ) : (
                "Continue"
              )}
            </Button>
          </div>
        </div>

        <p className="text-center text-sm text-slate-500">
          Already applied?{" "}
          <Link to="/application-status" className="font-semibold text-primary hover:underline">
            Check application status
          </Link>
        </p>
      </div>
    </PublicLayout>
  );
}
