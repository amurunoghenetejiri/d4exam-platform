import { PageHeader, SectionCard, InfoRow } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useSessionUser, signOut } from "@/lib/session";
import {
  DEFAULT_NOTIFICATION_PREFS,
  loadNotificationPrefs,
  saveNotificationPrefs,
  type NotificationPrefs,
} from "@/lib/notification-prefs";
import {
  updateSchoolLogoUrl,
  updateSchoolName,
  uploadSchoolLogo,
  useSchoolIdentity,
  validateLogoFile,
} from "@/lib/school-identity";
import { SchoolLogo } from "@/components/brand/SchoolLogo";
import { Loader2, Upload, Building2 } from "lucide-react";

export function SettingsPage({ scope }: { scope: string }) {
  const { data: session } = useSessionUser();
  const [saving, setSaving] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>({ ...DEFAULT_NOTIFICATION_PREFS });
  const [compactTables, setCompactTables] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const scopeLower = (scope || "").toLowerCase();
  const isSchoolAdmin =
    scopeLower.includes("school admin") ||
    scopeLower.includes("admin") ||
    scopeLower === "school";

  useEffect(() => {
    if (!session?.userId) return;
    setNotifPrefs(loadNotificationPrefs(session.userId));
    try {
      setCompactTables(localStorage.getItem(`d4exam_pref_compact:${session.userId}`) === "1");
      setReducedMotion(localStorage.getItem(`d4exam_pref_reduced:${session.userId}`) === "1");
    } catch { /* ignore */ }
  }, [session?.userId]);

  function savePrefs() {
    setSaving(true);
    try {
      if (session?.userId) {
        saveNotificationPrefs(session.userId, notifPrefs);
        try {
          localStorage.setItem(`d4exam_pref_compact:${session.userId}`, compactTables ? "1" : "0");
          localStorage.setItem(`d4exam_pref_reduced:${session.userId}`, reducedMotion ? "1" : "0");
        } catch { /* ignore */ }
      }
      toast.success("Notification and display preferences saved.");
    } catch {
      toast.error("Could not save preferences on this device.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description={`Manage your school identity, preferences and account for ${scope}.`}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {isSchoolAdmin && <SchoolIdentityCard />}

        <SectionCard title="Preferences" description="Regional and display options">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lang">Language</Label>
              <Select defaultValue="en">
                <SelectTrigger id="lang">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                  <SelectItem value="ar">Arabic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tz">Time zone</Label>
              <Select defaultValue="wat">
                <SelectTrigger id="tz">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wat">West Africa Time (UTC+1)</SelectItem>
                  <SelectItem value="gmt">Greenwich Mean Time (UTC)</SelectItem>
                  <SelectItem value="eat">East Africa Time (UTC+3)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <ToggleRow id="compact" label="Compact tables" hint="Reduce row height on data tables" checked={compactTables} onCheckedChange={setCompactTables} />
            <ToggleRow id="reduced" label="Reduced motion" hint="Minimise interface animation" checked={reducedMotion} onCheckedChange={setReducedMotion} />
          </div>
        </SectionCard>

        <SectionCard title="Notifications" description="Choose what you get alerted about">
          <div className="space-y-4">
            <ToggleRow id="n1" label="Examination reminders" hint="24 hours before" checked={notifPrefs.examReminders} onCheckedChange={(v) => setNotifPrefs((p) => ({ ...p, examReminders: v }))} />
            <ToggleRow id="n2" label="Result publications" checked={notifPrefs.resultPublications} onCheckedChange={(v) => setNotifPrefs((p) => ({ ...p, resultPublications: v }))} />
            <ToggleRow id="n3" label="Integrity alerts" checked={notifPrefs.integrityAlerts} onCheckedChange={(v) => setNotifPrefs((p) => ({ ...p, integrityAlerts: v }))} />
            <ToggleRow id="n4" label="Product announcements" checked={notifPrefs.productAnnouncements} onCheckedChange={(v) => setNotifPrefs((p) => ({ ...p, productAnnouncements: v }))} />
          </div>
        </SectionCard>

        <SectionCard title="Security" description="Protect your account">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cur">Current password</Label>
              <Input id="cur" type="password" autoComplete="current-password" placeholder="••••••••" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new">New password</Label>
              <Input id="new" type="password" autoComplete="new-password" placeholder="At least 8 characters" />
            </div>
            <ToggleRow id="2fa" label="Two-factor authentication" hint="Email one-time code" />
            <Button disabled={saving} onClick={() => savePrefs()}>
              {saving ? "Saving…" : "Save preferences"}
            </Button>
          </div>
        </SectionCard>

        <SectionCard title="Session" description="Device and access information">
          <InfoRow label="Account scope" value={scope} />
          <div className="pt-4">
            <Button variant="outline" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </SectionCard>
      </div>
    </>
  );
}

function SchoolIdentityCard() {
  const { data: session, isLoading: sessionLoading } = useSessionUser();
  const schoolId = session?.schoolId ?? null;
  const { data: school, isLoading: schoolLoading, refetch, error: schoolError } =
    useSchoolIdentity(schoolId);
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [nameBusy, setNameBusy] = useState(false);

  useEffect(() => {
    if (school?.name) setName(school.name);
    else if (session?.schoolName) setName(session.schoolName);
  }, [school?.name, session?.schoolName]);

  function onPick(f: File | null) {
    if (!f) return;
    const err = validateLogoFile(f);
    if (err) {
      toast.error(err);
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function saveName() {
    if (!schoolId) {
      toast.error("No school linked to this account.");
      return;
    }
    setNameBusy(true);
    try {
      await updateSchoolName(schoolId, name);
      await refetch();
      await qc.invalidateQueries({ queryKey: ["school-identity"] });
      await qc.invalidateQueries({ queryKey: ["session-user"] });
      toast.success("School name updated.");
    } catch (e) {
      toast.error((e as Error).message || "Could not update school name");
    } finally {
      setNameBusy(false);
    }
  }

  async function saveLogo() {
    if (!schoolId) {
      toast.error("No school linked to this account.");
      return;
    }
    if (!file) {
      toast.error("Choose a logo file first.");
      return;
    }
    setBusy(true);
    try {
      const { url } = await uploadSchoolLogo({ file, folder: schoolId });
      await updateSchoolLogoUrl(schoolId, url);
      await refetch();
      await qc.invalidateQueries({ queryKey: ["school-identity"] });
      await qc.invalidateQueries({ queryKey: ["session-user"] });
      toast.success("School logo saved. It will show across your portal.");
      setFile(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      const msg = (e as Error).message || "Could not update logo";
      toast.error(msg);
      console.error("[school logo]", e);
    } finally {
      setBusy(false);
    }
  }

  function cancelLogo() {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  if (sessionLoading || schoolLoading) {
    return (
      <SectionCard title="School Identity / Branding" className="lg:col-span-2">
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading school…
        </p>
      </SectionCard>
    );
  }

  if (!schoolId) {
    return (
      <SectionCard title="School Identity / Branding" className="lg:col-span-2">
        <p className="text-sm text-slate-500">
          No school is linked to this account. Sign in as a school administrator to manage branding.
        </p>
      </SectionCard>
    );
  }

  if (schoolError) {
    return (
      <SectionCard title="School Identity / Branding" className="lg:col-span-2">
        <p className="text-sm text-red-600">
          Could not load school: {(schoolError as Error).message}
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="School Identity / Branding"
      description="Official name and logo for your institution on D4EXAM"
      className="lg:col-span-2"
    >
      <div className="space-y-6">
        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="school-name" className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" /> School name
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="school-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Institution name"
              className="flex-1"
            />
            <Button
              type="button"
              className="font-semibold sm:w-auto"
              disabled={nameBusy || !name.trim() || name.trim() === school?.name}
              onClick={() => void saveName()}
            >
              {nameBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save name
            </Button>
          </div>
          {school?.schoolCode && (
            <p className="text-xs text-slate-500">
              School code: <span className="font-mono font-semibold">{school.schoolCode}</span>{" "}
              (cannot be changed here)
            </p>
          )}
        </div>

        <Separator />

        {/* Logo */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Current logo</p>
            <div className="grid h-24 w-24 place-items-center rounded-2xl border border-slate-200 bg-slate-50 p-2">
              <SchoolLogo
                logoUrl={school?.logoUrl}
                schoolName={school?.name}
                size="xl"
                className="h-20 w-20"
              />
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <p className="text-sm text-slate-600">
              Upload PNG, JPG or WebP (max 2MB). Saved to your school record and shown on dashboards
              and exams.
            </p>

            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,.png,.jpg,.jpeg,.webp"
              className="hidden"
              onChange={(e) => onPick(e.target.files?.[0] ?? null)}
            />

            {preview && (
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <img
                  src={preview}
                  alt="New logo preview"
                  className="h-16 w-16 rounded-lg object-contain bg-white"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">New logo preview</p>
                  <p className="truncate text-xs text-slate-500">{file?.name}</p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-2 font-semibold"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
              >
                <Upload className="h-4 w-4" />
                {school?.logoUrl ? "Change logo" : "Upload logo"}
              </Button>
              {file && (
                <>
                  <Button
                    type="button"
                    className="font-semibold"
                    disabled={busy}
                    onClick={() => void saveLogo()}
                  >
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save logo
                  </Button>
                  <Button type="button" variant="ghost" disabled={busy} onClick={cancelLogo}>
                    Cancel
                  </Button>
                </>
              )}
            </div>

            {!school?.logoUrl && !preview && (
              <p className="text-xs text-amber-700">
                No logo yet — D4EXAM mark is shown until you upload one.
              </p>
            )}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function ToggleRow({
  id,
  label,
  hint,
  defaultChecked,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onCheckedChange?: (value: boolean) => void;
}) {
  const controlled = typeof checked === "boolean";
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {controlled ? (
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      ) : (
        <Switch id={id} defaultChecked={defaultChecked} />
      )}
    </div>
  );
}
