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
import { uploadSchoolLogo } from "@/lib/school-identity";
import { notifySuperAdminsOfApplication } from "@/lib/notify-super-admin-application";
import { MapPinPicker } from "@/components/MapPinPicker";

export const Route = createFileRoute("/school-application")({
  head: () => ({
    meta: [
      { title: "Apply Your School — D4EXAM" },
      { name: "description", content: "Register your school on D4EXAM." },
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
  const [website, setWebsite] = useState("");
  const [socialLink, setSocialLink] = useState("");
  const [approxStudents, setApproxStudents] = useState("");
  const [approxTeachers, setApproxTeachers] = useState("");
  const [appType, setAppType] = useState<"full" | "trial">(() => {
    if (typeof window === "undefined") return "full";
    try {
      const q = new URLSearchParams(window.location.search).get("type");
      if (q === "trial" || q === "demo") return "trial";
    } catch { /* ignore */ }
    return "full";
  });
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isTrialResult, setIsTrialResult] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const trackRaw = localStorage.getItem(TRACK_KEY);
      if (trackRaw) {
        const track = JSON.parse(trackRaw) as { id?: string; trackingCode?: string };
        if (track.trackingCode) setTrackingCode(track.trackingCode);
        if (track.id) setRefId(track.id);
      }
    } catch { /* ignore */ }
  }, []);


  function onLogoPick(f: File | null) {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      setError("Logo must be under 5MB.");
      return;
    }
    setError("");
    setLogoFile(f);
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        if (result.startsWith("data:")) setLogoPreview(result);
      };
      reader.readAsDataURL(f);
    } catch {
      setLogoPreview(null);
    }
  }

  async function submitApplication() {
    setError("");
    const isTrial = appType === "trial";
    if (!isTrial && !logoFile) {
      setError("Please upload your official school logo.");
      return;
    }
    if (!schoolName.trim() || !applicantName.trim() || !applicantEmail.trim()) {
      setError("School name, applicant name and email are required.");
      return;
    }
    setLoading(true);
    try {
      let logoUrl: string | null = logoPreview && logoPreview.startsWith("data:") ? logoPreview : null;
      if (logoFile) {
        try {
          const uploaded = await uploadSchoolLogo({ file: logoFile, folder: `applications/${Date.now()}` });
          if (uploaded?.url) logoUrl = uploaded.url;
        } catch (e) {
          console.warn("[school-application] logo upload", e);
        }
        if (!logoUrl && !isTrial) {
          setError("Could not save the school logo.");
          setLoading(false);
          return;
        }
      }
      const trialHours = 48;
      const trialEndsAt = isTrial ? new Date(Date.now() + trialHours * 60 * 60 * 1000).toISOString() : null;
      const code = makeTrackingCode();
      const { data, error: insertError } = await supabase
        .from("school_applications")
        .insert({
          school_name: schoolName.trim(),
          school_type: schoolType || "other",
          country: country.trim() || null,
          state: state.trim() || null,
          city: city.trim() || null,
          address: address.trim() || null,
          official_email: officialEmail.trim() || applicantEmail.trim(),
          official_phone: officialPhone.trim() || null,
          applicant_name: applicantName.trim(),
          applicant_email: applicantEmail.trim(),
          applicant_phone: applicantPhone.trim() || null,
          tracking_code: code,
          status: "pending",
          documents: {
            logo_url: logoUrl,
            logo_name: logoFile?.name || null,
            notes: notes.trim() || null,
            website: website.trim() || null,
            social_link: socialLink.trim() || null,
            approx_students: approxStudents.trim() || null,
            approx_teachers: approxTeachers.trim() || null,
            application_type: isTrial ? "trial" : "full",
            trial_hours: isTrial ? trialHours : null,
            trial_ends_at: trialEndsAt,
            is_trial: isTrial,
            lat,
            lng,
            auto_approve_requested: isTrial,
          } as never,
        })
        .select("id, tracking_code")
        .single();
      if (insertError || !data?.id) {
        setError(insertError?.message || "Could not submit application.");
        setLoading(false);
        return;
      }
      const savedCode = (data as { tracking_code?: string }).tracking_code || code;
      setRefId(data.id);
      setTrackingCode(savedCode);
      setIsTrialResult(isTrial);
      try {
        localStorage.setItem(TRACK_KEY, JSON.stringify({ id: data.id, trackingCode: savedCode, email: applicantEmail.trim() }));
        localStorage.removeItem(DRAFT_KEY);
      } catch { /* ignore */ }
      try {
        void notifySuperAdminsOfApplication(schoolName.trim() + (isTrial ? " (Trial/Demo)" : ""), data.id as string, savedCode);
      } catch { /* ignore */ }
    } catch (err) {
      setError((err as Error).message || "Could not submit application.");
    } finally {
      setLoading(false);
    }
  }

  function next() {
    setError("");
    if (step === 0 && appType === "full" && !logoFile) {
      setError("School logo is required for full applications.");
      return;
    }
    if (step < steps.length - 1) setStep((s) => s + 1);
    else void submitApplication();
  }

  if (refId && trackingCode) {
    return (
      <PublicLayout>
        <div className="mx-auto max-w-lg space-y-4 px-4 py-12 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <h1 className="text-2xl font-extrabold text-slate-900">{isTrialResult ? "Trial application submitted" : "Application submitted"}</h1>
          <p className="text-sm text-slate-600">{isTrialResult ? "Your Trial / Demo request is in. Keep your reference code. Super admin activates it quickly." : "Keep your reference code to track review."}</p>
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-mono text-lg font-bold text-emerald-900">{trackingCode}</p>
          <Button asChild className="font-semibold"><Link to="/application-status">Check application status</Link></Button>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="mx-auto max-w-xl space-y-6 px-4 py-10">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Apply for your school</h1>
          <p className="mt-1 text-sm text-slate-500">Full school or Trial / Demo. Logo required for full applications; map pin is optional.</p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {steps.map((s, i) => (
            <div key={s} className="space-y-1">
              <div className={cn("h-1 rounded-full", i <= step ? "bg-primary" : "bg-slate-200")} />
              <p className={cn("text-[10px] font-semibold uppercase tracking-wide sm:text-xs", i <= step ? "text-primary" : "text-slate-400")}>{s}</p>
            </div>
          ))}
        </div>
        {error ? (<Alert variant="destructive"><AlertTitle>Check this</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>) : null}
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {step === 0 && (
            <>
              <div className="space-y-1.5"><Label>Application type</Label>
                <div className="flex gap-2">
                  <button type="button" className={cn("flex-1 rounded-lg border px-3 py-2 text-sm font-semibold", appType === "full" ? "border-primary bg-primary/5 text-primary" : "border-slate-200")} onClick={() => setAppType("full")}>Full school</button>
                  <button type="button" className={cn("flex-1 rounded-lg border px-3 py-2 text-sm font-semibold", appType === "trial" ? "border-primary bg-primary/5 text-primary" : "border-slate-200")} onClick={() => setAppType("trial")}>Trial / Demo</button>
                </div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="schoolName">School name</Label><Input id="schoolName" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} className="h-11" required /></div>
              <div className="space-y-1.5">
                <Label>Official school logo {appType === "full" ? <span className="text-red-500">*</span> : <span className="text-slate-400">(optional for trial)</span>}</Label>
                <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => onLogoPick(e.target.files?.[0] ?? null)} />
                <div className="flex items-center gap-3">
                  {logoPreview ? <img src={logoPreview} alt="Logo" className="h-16 w-16 rounded-lg object-contain border border-slate-200" /> : null}
                  <Button type="button" variant="outline" className="font-semibold" onClick={() => logoRef.current?.click()}>{logoFile ? "Change logo" : "Upload logo"}</Button>
                </div>
              </div>
              <div className="space-y-1.5"><Label>School type</Label>
                <Select value={schoolType} onValueChange={setSchoolType}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
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
                <div className="space-y-1.5"><Label htmlFor="country">Country</Label><Input id="country" value={country} onChange={(e) => setCountry(e.target.value)} className="h-11" /></div>
                <div className="space-y-1.5"><Label htmlFor="state">State</Label><Input id="state" value={state} onChange={(e) => setState(e.target.value)} className="h-11" /></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="city">City</Label><Input id="city" value={city} onChange={(e) => setCity(e.target.value)} className="h-11" /></div>
              <div className="space-y-1.5"><Label htmlFor="address">Address</Label><Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} className="h-11" /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="website">Website (optional)</Label><Input id="website" value={website} onChange={(e) => setWebsite(e.target.value)} className="h-11" placeholder="https://..." /></div>
                <div className="space-y-1.5"><Label htmlFor="socialLink">Social link (optional)</Label><Input id="socialLink" value={socialLink} onChange={(e) => setSocialLink(e.target.value)} className="h-11" placeholder="Facebook, X, LinkedIn…" /></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="approxStudents">Approx. students</Label><Input id="approxStudents" value={approxStudents} onChange={(e) => setApproxStudents(e.target.value)} className="h-11" inputMode="numeric" /></div>
                <div className="space-y-1.5"><Label htmlFor="approxTeachers">Approx. teachers</Label><Input id="approxTeachers" value={approxTeachers} onChange={(e) => setApproxTeachers(e.target.value)} className="h-11" inputMode="numeric" /></div>
              </div>
              <MapPinPicker
                lat={lat}
                lng={lng}
                onChange={(a, b) => {
                  setLat(a);
                  setLng(b);
                }}
                city={city}
                state={state}
                country={country}
                onError={(msg) => setError(msg || "")}
              />
            </>
          )}
          {step === 1 && (
            <>
              <div className="space-y-1.5"><Label htmlFor="applicantName">Full name</Label><Input id="applicantName" value={applicantName} onChange={(e) => setApplicantName(e.target.value)} className="h-11" required /></div>
              <div className="space-y-1.5"><Label htmlFor="applicantEmail">Email</Label><Input id="applicantEmail" type="email" value={applicantEmail} onChange={(e) => setApplicantEmail(e.target.value)} className="h-11" required /></div>
              <div className="space-y-1.5"><Label htmlFor="applicantPhone">Phone</Label><Input id="applicantPhone" value={applicantPhone} onChange={(e) => setApplicantPhone(e.target.value)} className="h-11" /></div>
            </>
          )}
          {step === 2 && (
            <>
              <div className="space-y-1.5"><Label htmlFor="officialEmail">Official school email</Label><Input id="officialEmail" type="email" value={officialEmail} onChange={(e) => setOfficialEmail(e.target.value)} className="h-11" /></div>
              <div className="space-y-1.5"><Label htmlFor="officialPhone">Official school phone</Label><Input id="officialPhone" value={officialPhone} onChange={(e) => setOfficialPhone(e.target.value)} className="h-11" /></div>
              <div className="space-y-1.5"><Label htmlFor="notes">Notes (optional)</Label><Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} /></div>
            </>
          )}
          {step === 3 && (
            <div className="space-y-2 text-sm text-slate-700">
              <p><span className="font-semibold">Type:</span> {appType === "trial" ? "Trial / Demo" : "Full school"}</p>
              <p><span className="font-semibold">School:</span> {schoolName || "—"} ({schoolType})</p>
              <p><span className="font-semibold">Location:</span> {[city, state, country].filter(Boolean).join(", ") || "—"}</p>
              {lat != null && lng != null ? <p><span className="font-semibold">Map pin:</span> {lat.toFixed(5)}, {lng.toFixed(5)}</p> : null}
              <p><span className="font-semibold">Contact:</span> {applicantName || "—"} · {applicantEmail || "—"}</p>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            {step > 0 ? <Button type="button" variant="outline" className="font-semibold" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={loading}>Back</Button> : null}
            <Button type="button" className="h-11 flex-1 font-semibold" onClick={next} disabled={loading}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…</> : step === steps.length - 1 ? "Submit application" : "Continue"}
            </Button>
          </div>
        </div>
        <p className="text-center text-sm text-slate-500">
          Already applied? <Link to="/application-status" className="font-semibold text-primary hover:underline">Check status</Link>
          {" · "}
          <Link to="/features" className="font-semibold text-primary hover:underline">Explore features / demo</Link>
        </p>
      </div>
    </PublicLayout>
  );
}
