import { useEffect, useState } from "react";
import { PageHeader, SectionCard, InfoRow, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { initials, useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { SchoolLogo } from "@/components/brand/SchoolLogo";
import { useSchoolIdentity } from "@/lib/school-identity";
import { useQueryClient } from "@tanstack/react-query";
import { useStudentContext } from "@/lib/student";

const roleLabel: Record<string, string> = {
  student: "Student",
  teacher: "Teacher",
  school_admin: "School Administrator",
  examination_officer: "Examination Officer",
  super_admin: "Super Administrator",
};

export function ProfilePage() {
  const { data: user, isLoading, error } = useSessionUser();
  const { data: school } = useSchoolIdentity(user?.schoolId);
  const { data: student } = useStudentContext();
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setFullName(user.fullName || student?.fullName || "");
    void (async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("phone, full_name")
          .eq("auth_user_id", user.userId)
          .maybeSingle();
        if (data?.phone) setPhone(String(data.phone));
        if (data?.full_name && !user.fullName) setFullName(String(data.full_name));
      } catch {
        /* optional phone column */
      }
    })();
  }, [user, student?.fullName]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.userId) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { full_name: fullName.trim() };
      if (phone.trim()) payload.phone = phone.trim();
      const { error: upErr } = await supabase
        .from("profiles")
        .update(payload as never)
        .eq("auth_user_id", user.userId);
      if (upErr) {
        const { error: up2 } = await supabase
          .from("profiles")
          .update({ full_name: fullName.trim() } as never)
          .eq("auth_user_id", user.userId);
        if (up2) throw up2;
      }
      if (user.role === "student" && student?.studentId) {
        await supabase
          .from("students")
          .update({ full_name: fullName.trim() } as never)
          .eq("id", student.studentId);
      }
      await qc.invalidateQueries({ queryKey: ["session-user"] });
      await qc.invalidateQueries({ queryKey: ["student-context"] });
      toast.success("Profile saved");
    } catch (err) {
      toast.error((err as Error).message || "Could not save profile");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading profile…
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Could not load profile"
        description={(error as Error).message || "Try signing out and back in."}
      />
    );
  }

  if (!user) {
    return (
      <EmptyState title="Not signed in" description="Sign in to view and edit your profile." />
    );
  }

  const avatar = initials(user.fullName || user.email || "U");
  const role = user.role ? roleLabel[user.role] ?? user.role : "User";
  const logoUrl = school?.logoUrl ?? user.schoolLogoUrl;
  const schoolName = school?.name ?? user.schoolName;

  return (
    <>
      <PageHeader title="Profile" description="Your account details for this school portal" />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <SectionCard>
          <div className="flex flex-col items-center text-center">
            {logoUrl ? (
              <SchoolLogo logoUrl={logoUrl} schoolName={schoolName} size="xl" className="ring-1 ring-slate-200" />
            ) : (
              <span className="grid h-20 w-20 place-items-center rounded-full bg-primary/15 font-display text-2xl font-bold text-primary">
                {avatar}
              </span>
            )}
            <h2 className="mt-4 text-lg font-bold text-slate-900">{fullName || user.fullName || "—"}</h2>
            <p className="text-sm text-muted-foreground">{role}</p>
            <p className="mt-1 text-xs font-semibold text-slate-600">{schoolName || "Platform"}</p>
          </div>
          <div className="mt-6">
            <InfoRow label={user.identifierLabel} value={user.identifier || student?.matric || "—"} />
            <InfoRow label="Email" value={user.email || "—"} />
            <InfoRow label="Status" value={user.status || "active"} />
            {user.schoolCode && <InfoRow label="School code" value={user.schoolCode} />}
            {student?.departmentName && <InfoRow label="Department" value={student.departmentName} />}
            {student?.facultyName && <InfoRow label="Faculty / College" value={student.facultyName} />}
            {student?.levelName && <InfoRow label="Level" value={student.levelName} />}
            {student?.sessionName && <InfoRow label="Session" value={student.sessionName} />}
            {student?.semesterName && <InfoRow label="Semester" value={student.semesterName} />}
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
              <Input
                id="ident"
                value={user.identifier || student?.matric || "—"}
                readOnly
                className="bg-slate-50"
              />
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
