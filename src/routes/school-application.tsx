import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { notifySuperAdminsOfApplication } from "@/lib/notify-super-admin-application";

export const Route = createFileRoute("/school-application")({
  head: () => ({
    meta: [
      { title: "Apply for School — D4EXAM" },
      {
        name: "description",
        content: "Submit your institution for D4EXAM platform access.",
      },
    ],
  }),
  component: Page,
});

const TRACK_KEY = "d4exam_school_application_track";
const DRAFT_KEY = "d4exam_school_application_draft";

function makeTrackingCode() {
  const part = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `D4-${part}`;
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
  const fileRef = useRef<HTMLInputElement>(null);

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!schoolName.trim() || !applicantName.trim() || !applicantEmail.trim()) {
      setError("School name, applicant name and email are required.");
      return;
    }
    setLoading(true);
    try {
      let logoUrl: string | null = null;
      if (logoFile) {
        try {
          const path = `school-logos/${Date.now()}-${logoFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
          const { error: upErr } = await supabase.storage.from("public").upload(path, logoFile);
          if (!upErr) {
            const { data: pub } = supabase.storage.from("public").getPublicUrl(path);
            logoUrl = pub?.publicUrl ?? null;
          }
        } catch (logoErr) {
          console.warn("[school-application] logo upload failed:", logoErr);
          logoUrl = null;
        }
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
          documents: logoUrl ? ({ logo_url: logoUrl } as never) : ({} as never),
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
        localStorage.setItem(TRACK_KEY, JSON.stringify({ id: data.id, trackingCode: savedCode }));
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }

      void notifySuperAdminsOfApplication(schoolName.trim(), data.id, savedCode);
    } catch (err) {
      setError((err as Error).message || "Could not submit application.");
    } finally {
      setLoading(false);
    }
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
              <Link to="/application-status">Check status</Link>
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
            Submit your institution details. A platform admin will review your request.
          </p>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="space-y-1.5">
            <Label htmlFor="schoolName">School name</Label>
            <Input id="schoolName" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} className="h-11" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="schoolType">School type</Label>
            <Input id="schoolType" value={schoolType} onChange={(e) => setSchoolType(e.target.value)} className="h-11" />
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
          <div className="space-y-1.5">
            <Label htmlFor="officialEmail">Official email</Label>
            <Input id="officialEmail" type="email" value={officialEmail} onChange={(e) => setOfficialEmail(e.target.value)} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="officialPhone">Official phone</Label>
            <Input id="officialPhone" value={officialPhone} onChange={(e) => setOfficialPhone(e.target.value)} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="applicantName">Applicant full name</Label>
            <Input id="applicantName" value={applicantName} onChange={(e) => setApplicantName(e.target.value)} className="h-11" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="applicantEmail">Applicant email</Label>
            <Input id="applicantEmail" type="email" value={applicantEmail} onChange={(e) => setApplicantEmail(e.target.value)} className="h-11" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="applicantPhone">Applicant phone</Label>
            <Input id="applicantPhone" value={applicantPhone} onChange={(e) => setApplicantPhone(e.target.value)} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="logo">School logo (optional)</Label>
            <Input
              id="logo"
              ref={fileRef}
              type="file"
              accept="image/*"
              className="h-11"
              onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <Button type="submit" className="h-11 w-full font-semibold" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…
              </>
            ) : (
              "Submit application"
            )}
          </Button>
        </form>

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
