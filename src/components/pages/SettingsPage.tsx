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
import { useState } from "react";

export function SettingsPage({ scope }: { scope: string }) {
  const [saving, setSaving] = useState(false);

  return (
    <>
      <PageHeader
        title="Settings"
        description={`Manage preferences, notifications and security for your ${scope} account.`}
      />

      <div className="grid gap-6 lg:grid-cols-2">
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
            <ToggleRow
              id="compact"
              label="Compact tables"
              hint="Reduce row height on data tables"
            />
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
          <InfoRow label="Current device" value="Chrome · Windows 11" />
          <InfoRow label="IP address" value="102.89.34.11" />
          <InfoRow label="Last sign in" value="Today · 08:42 AM" />
          <InfoRow label="Account scope" value={scope} />
          <div className="pt-4">
            <Button variant="outline">Sign out of all devices</Button>
          </div>
        </SectionCard>
      </div>
    </>
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
