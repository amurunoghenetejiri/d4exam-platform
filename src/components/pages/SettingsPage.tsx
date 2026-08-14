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
import { useRef, useState } from "react";
import { useSessionUser } from "@/lib/session";
import {
  updateSchoolLogoUrl,
  uploadSchoolLogo,
  useSchoolIdentity,
  validateLogoFile,
} from "@/lib/school-identity";
import { SchoolLogo } from "@/components/brand/SchoolLogo";
import { Loader2, Upload } from "lucide-react";

export function SettingsPage({ scope }: { scope: string }) {
  const [saving, setSaving] = useState(false);
  const isSchoolAdmin = scope.toLowerCase().includes("school admin");

  return (
    <>
      <PageHeader
        title="Settings"
        description={`Manage preferences, notifications and security for your ${scope} account.`}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {isSchoolAdmin && <SchoolBrandingCard />}

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
            <ToggleRow id="compact" label="Compact tables" hint="Reduce row height on data tables" />
            <ToggleRow id="reduced" label="Reduced motion" hint="Minimise interface animation" />
          </div>
        </SectionCard>

        <SectionCard title="Notifications" description="Choose what you get alerted about">
          <div className="space-y-4">
            <ToggleRow id="n1" label="Examination reminders" defaultChecked hint="24 hours before" />
            <ToggleRow id="n2" label="Result publications" defaultChecked />
            <ToggleRow id="n3" label="Integrity alerts" defaultChecked />
            <ToggleRow id="n4" label="Product announcements" />
          </div>
        </SectionCard>

        <SectionCard title="Security" description="Protect your account">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cur">Current password</Label>
              <Input id="cur" type="password" placeholder="••••••••" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new">New password</Label>
              <Input id="new" type="password" placeholder="At least 8 characters" />
            </div>
            <ToggleRow id="2fa" label="Two-factor authentication" hint="Email one-time code" />
            <Button
              disabled={saving}
              onClick={() => {
                setSaving(true);
                setTimeout(() => {
                  setSaving(false);
                  toast.success("Settings saved");
                }, 900);
              }}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </SectionCard>

        <SectionCard title="Session" description="Device and access information">
          <InfoRow label="Account scope" value={scope} />
          <div className="pt-4">
            <Button variant="outline">Sign out of all devices</Button>
          </div>
        </SectionCard>
      </div>
    </>
  );
}

function SchoolBrandingCard() {
  const { data: session } = useSessionUser();
  const schoolId = session?.schoolId ?? null;
  const { data: school, refetch } = useSchoolIdentity(schoolId);
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

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

  async function saveLogo() {
    if (!schoolId || !file) return;
    setBusy(true);
    try {
      const { url } = await uploadSchoolLogo({ file, folder: schoolId });
      await updateSchoolLogoUrl(schoolId, url);
      await refetch();
      await qc.invalidateQueries({ queryKey: ["school-identity"] });
      await qc.invalidateQueries({ queryKey: ["session-user"] });
      toast.success("School logo updated. It will appear across your portal.");
      setFile(null);
      setPreview(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      toast.error((e as Error).message || "Could not update logo");
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  if (!schoolId) {
    return (
      <SectionCard title="School Identity / Branding">
        <p className="text-sm text-slate-500">No school linked to this account.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="School Identity / Branding"
      description="Official logo for your institution across D4EXAM"
      className="lg:col-span-2"
    >
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
          <p className="max-w-[140px] text-center text-xs font-semibold text-slate-700">
            {school?.name ?? session?.schoolName ?? "School"}
          </p>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-sm text-slate-600">
            Upload PNG, JPG or WebP (max 2MB). This becomes your official school identity on
            dashboards, exams and results.
          </p>

          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />

          {preview && (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <img src={preview} alt="New logo preview" className="h-16 w-16 rounded-lg object-contain" />
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
                <Button type="button" className="font-semibold" disabled={busy} onClick={() => void saveLogo()}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save logo
                </Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={cancel}>
                  Cancel
                </Button>
              </>
            )}
          </div>

          {!school?.logoUrl && !preview && (
            <p className="text-xs text-amber-700">
              No logo yet — the D4EXAM mark is shown until you upload one.
            </p>
          )}
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
}: {
  id: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch id={id} defaultChecked={defaultChecked} />
    </div>
  );
}
