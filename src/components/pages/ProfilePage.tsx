import { useEffect, useState } from "react";
import { PageHeader, SectionCard, InfoRow } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { initials, useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { SchoolLogo } from "@/components/brand/SchoolLogo";
import { useSchoolIdentity } from "@/lib/school-identity";
import { useQueryClient } from "@/tanstack/react-query";

const roleLabel: Record<string, string> = {
  student: "Student",
  teacher: "Teacher",
  school_admin: "School Administrator",
  examination_officer: "Examination Officer",
  super_admin: "Super Administrator",
};

export function ProfilePage() {
  const { data: user, isLoading } = useSessionUser();
  const { data: school } = useSchoolIdentity(user?.schoolId);
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setFullName(user.fullName || "");
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("phone")
        .eq("auth_user_id", user.userId)
        .maybeSingle();
      setPhone(data?.phone ?? "");
    })();
  }, [user]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.userId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          phone: phone.trim() || null,
        })
        .eq("auth_user_id", user.userId);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["session-user"] });
      toast.success("Profile saved");
    } catch (err) {
      toast.error((err as Error).message || "Could not save profile");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-slate-500">Loading profile…</p>;
  }

  if (!user) {
    return <p className="text-sm text-slate-500">Sign in to view your profile.</p>;
  }

  const avatar = initials(user.fullName || user.email || "U");
  const role = user.role ? roleLabel[user.role] ?? user.role : "User";

  return (
    <>
      <PageHeader title="Profile" description="Your personal and institutional information from the database." />

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <SectionCard>
          <div className="flex flex-col items-center text-center">
            {school?.logoUrl || user.schoolId ? (
              <SchoolLogo
                logoUrl={school?.logoUrl ?? user.schoolLogoUrl}
                schoolName={school?.name ?? user.schoolName}
                size="xl"
                className="ring-1 ring-slate-200"
              />
            ) : (
              <span className="grid h-20 w-20 place-items-center rounded-full bg-primary/15 font-display text-2xl font-bold text-primary">
                {avatar}
              </span>
            )}
            <h2 className="mt-4 text-lg font-bold">{user.fullName || "—"}</h2>
            <p className="text-sm text-muted-foreground">{role}</p>
            <p className="mt-1 text-xs font-semibold text-slate-600">{school?.name || user.schoolName || "Platform"}</p>
          </div>
          <div className="mt-6">
            <InfoRow label={user.identifierLabel} value={user.identifier || "—"} />
            <InfoRow label="Email" value={user.email || "—"} />
            <InfoRow label="Status" value={user.status} />
            {user.schoolCode && <InfoRow label="School code" value={user.schoolCode} />}
          </div>
        </SectionCard>

        <SectionCard title="Edit details" description="Only fields you are allowed to change are editable">
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={save}>
            <div className="space-y-2">
              <Label htmlFor="fullname">Full name</Label>
              <Input id="fullname" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input id="email" type="email" value={user.email} readOnly className="bg-slate-50" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Optional phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ident">{user.identifierLabel}</Label>
              <Input id="ident" value={user.identifier || "—"} readOnly className="bg-slate-50" />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={saving} className="font-semibold">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save profile
              </Button>
            </div>
          </form>
        </SectionCard>
      </div>
    </>
  );
}
