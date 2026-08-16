import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { PageHeader, SectionCard, EmptyState } from "@/components/dashboard/kit";
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
import { friendlyError } from "@/lib/friendly-error";
import { cn } from "@/lib/utils";

const roleLabel: Record<string, string> = {
  student: "Student",
  teacher: "Teacher",
  school_admin: "School Administrator",
  examination_officer: "Examination Officer",
  super_admin: "Super Administrator",
};

/** Stacked on mobile so long values never overflow the card */
function ProfileField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border-b border-slate-100 py-2.5 last:border-0 last:pb-0 first:pt-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:text-[11px]">
        {label}
      </p>
      <p className="mt-0.5 break-words text-sm font-semibold leading-snug text-slate-900 [overflow-wrap:anywhere]">
        {value ?? "—"}
      </p>
    </div>
  );
}

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

  async function save(e: FormEvent) {
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
      toast.error(friendlyError(err, "Could not save profile"));
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
        description="Try signing out and signing back in."
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
  const displayName = fullName || user.fullName || "—";

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title="Profile" description="Your account details for this school portal" />

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        {/* Identity card */}
        <SectionCard className="overflow-hidden">
          <div className="flex flex-col items-center px-1 text-center">
            {logoUrl ? (
              <SchoolLogo
                logoUrl={logoUrl}
                schoolName={schoolName}
                size="xl"
                className="ring-1 ring-slate-200"
              />
            ) : (
              <span className="grid h-16 w-16 place-items-center rounded-full bg-primary/15 font-display text-xl font-bold text-primary sm:h-20 sm:w-20 sm:text-2xl">
                {avatar}
              </span>
            )}
            <h2 className="mt-3 max-w-full break-words text-base font-extrabold leading-snug text-slate-900 sm:mt-4 sm:text-lg [overflow-wrap:anywhere]">
              {displayName}
            </h2>
            <p className="mt-0.5 text-xs font-medium text-slate-500 sm:text-sm">{role}</p>
            {schoolName ? (
              <p className="mt-1 max-w-full break-words text-[11px] font-semibold leading-snug text-slate-600 sm:text-xs [overflow-wrap:anywhere]">
                {schoolName}
              </p>
            ) : null}
          </div>

          <div className="mt-4 sm:mt-5">
            <ProfileField
              label={user.identifierLabel || "Matric number"}
              value={user.identifier || student?.matric || "—"}
            />
            <ProfileField label="Email" value={user.email || "—"} />
            <ProfileField label="Status" value={user.status || "active"} />
            {user.schoolCode ? <ProfileField label="School code" value={user.schoolCode} /> : null}
            {student?.departmentName ? (
              <ProfileField label="Department" value={student.departmentName} />
            ) : null}
            {student?.facultyName ? (
              <ProfileField label="Faculty / College" value={student.facultyName} />
            ) : null}
            {student?.levelName ? <ProfileField label="Level" value={student.levelName} /> : null}
            {student?.sessionName ? (
              <ProfileField label="Session" value={student.sessionName} />
            ) : null}
            {student?.semesterName ? (
              <ProfileField label="Semester" value={student.semesterName} />
            ) : null}
          </div>
        </SectionCard>

        {/* Edit card */}
        <SectionCard
          title="Edit details"
          description="Only fields you are allowed to change are editable"
        >
          <form className="grid gap-3 sm:grid-cols-2 sm:gap-4" onSubmit={save}>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="fullname">Full name</Label>
              <Input
                id="fullname"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full"
              />
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                value={user.email}
                readOnly
                className="w-full bg-slate-50 text-xs sm:text-sm"
              />
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Optional phone"
                className="w-full"
              />
            </div>
            <div className="space-y-1.5 min-w-0 sm:col-span-2">
              <Label htmlFor="ident">{user.identifierLabel || "Matric number"}</Label>
              <Input
                id="ident"
                value={user.identifier || student?.matric || "—"}
                readOnly
                className="w-full bg-slate-50 text-xs sm:text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <Button
                type="submit"
                disabled={saving}
                className={cn("w-full font-semibold sm:w-auto")}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save profile
              </Button>
            </div>
          </form>
        </SectionCard>
      </div>
    </div>
  );
}
