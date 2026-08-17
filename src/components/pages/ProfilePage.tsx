import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { PageHeader, SectionCard, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { initials, useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import {
  Building2,
  GraduationCap,
  Loader2,
  Shield,
  ShieldCheck,
  UserRound,
} from "lucide-react";
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

const roleBadgeStyles: Record<
  string,
  { className: string; icon: typeof UserRound }
> = {
  student: {
    className:
      "border-sky-200/80 bg-sky-50 text-sky-800 shadow-sm shadow-sky-100/80",
    icon: GraduationCap,
  },
  teacher: {
    className:
      "border-violet-200/80 bg-violet-50 text-violet-800 shadow-sm shadow-violet-100/80",
    icon: UserRound,
  },
  school_admin: {
    className:
      "border-emerald-200/80 bg-emerald-50 text-emerald-800 shadow-sm shadow-emerald-100/80",
    icon: Building2,
  },
  examination_officer: {
    className:
      "border-amber-200/80 bg-amber-50 text-amber-900 shadow-sm shadow-amber-100/80",
    icon: Shield,
  },
  super_admin: {
    className:
      "border-indigo-200/80 bg-indigo-50 text-indigo-900 shadow-sm shadow-indigo-100/80",
    icon: ShieldCheck,
  },
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

function RoleBadge({ roleKey }: { roleKey: string }) {
  const label = roleLabel[roleKey] ?? roleKey;
  const style = roleBadgeStyles[roleKey] ?? {
    className: "border-slate-200 bg-slate-50 text-slate-700 shadow-sm",
    icon: UserRound,
  };
  const Icon = style.icon;

  return (
    <Badge
      variant="outline"
      className={cn(
        "mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide sm:text-xs",
        style.className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {label}
    </Badge>
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
  const roleKey = user.role || "user";
  const logoUrl = school?.logoUrl ?? user.schoolLogoUrl;
  const schoolName = school?.name ?? user.schoolName;
  const displayName = fullName || user.fullName || "—";
  const statusLabel = (user.status || "active").replace(/_/g, " ");

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title="Profile" description="Your account details for this school portal" />

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        {/* Identity card */}
        <SectionCard className="overflow-hidden p-0">
          <div className="relative bg-gradient-to-br from-primary/12 via-sky-50/80 to-white px-4 pb-5 pt-6 sm:px-5 sm:pb-6 sm:pt-7">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/15 via-transparent to-transparent"
              aria-hidden
            />
            <div className="relative flex flex-col items-center text-center">
              <div className="relative">
                {logoUrl ? (
                  <SchoolLogo
                    logoUrl={logoUrl}
                    schoolName={schoolName}
                    size="xl"
                    className="ring-2 ring-white shadow-md shadow-slate-200/80"
                  />
                ) : (
                  <span className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-primary to-primary/80 font-display text-xl font-bold text-white shadow-md shadow-primary/25 ring-2 ring-white sm:h-20 sm:w-20 sm:text-2xl">
                    {avatar}
                  </span>
                )}
              </div>

              <h2 className="mt-3 max-w-full break-words text-base font-extrabold leading-snug text-slate-900 sm:mt-3.5 sm:text-lg [overflow-wrap:anywhere]">
                {displayName}
              </h2>

              <RoleBadge roleKey={roleKey} />

              {schoolName ? (
                <p className="mt-2.5 max-w-full break-words text-[11px] font-semibold leading-snug text-slate-600 sm:text-xs [overflow-wrap:anywhere]">
                  {schoolName}
                </p>
              ) : null}
            </div>
          </div>

          <div className="px-4 pb-4 pt-1 sm:px-5 sm:pb-5">
            <ProfileField
              label={user.identifierLabel || "Matric number"}
              value={user.identifier || student?.matric || "—"}
            />
            <ProfileField label="Email" value={user.email || "—"} />
            <ProfileField
              label="Status"
              value={
                <span className="inline-flex items-center gap-1.5 capitalize">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      statusLabel === "active" ? "bg-emerald-500" : "bg-slate-400",
                    )}
                    aria-hidden
                  />
                  {statusLabel}
                </span>
              }
            />
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
