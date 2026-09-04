import { useMemo, useState } from "react";
import { SectionCard } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Check, Loader2, RefreshCw } from "lucide-react";
import {
  useSessionUser,
  switchActiveRole,
  roleHome,
  type AppRole,
} from "@/lib/session";

const LABELS: Record<string, string> = {
  student: "Student",
  teacher: "Teacher",
  school_admin: "School Admin",
  examination_officer: "Examination Officer",
  super_admin: "Super Admin",
};

export function RoleSwitchCard() {
  const { data: session } = useSessionUser();
  const [busy, setBusy] = useState<string | null>(null);

  const roles = useMemo(() => {
    const list = Array.isArray(session?.roles) ? session!.roles : [];
    const unique = [...new Set(list.filter(Boolean))] as AppRole[];
    // Always include current role
    if (session?.role && !unique.includes(session.role)) unique.unshift(session.role);
    return unique;
  }, [session?.roles, session?.role]);

  if (!session?.userId || roles.length < 2) {
    return null;
  }

  async function onSwitch(role: AppRole) {
    if (role === session?.role) {
      toast.message(`Already using ${LABELS[role] || role}.`);
      return;
    }
    if (!(role in roleHome)) {
      toast.error("Unknown role.");
      return;
    }
    setBusy(role);
    try {
      const result = await switchActiveRole(role);
      if (!result.ok) {
        toast.error(result.error || "Could not switch role.");
        setBusy(null);
        return;
      }
      // Full navigation happens inside switchActiveRole
      toast.success(`Switching to ${LABELS[role] || role}…`);
    } catch (e) {
      toast.error((e as Error).message || "Could not switch role.");
      setBusy(null);
    }
  }

  return (
    <SectionCard
      title="Switch role"
      description="This account has multiple roles. Switch anytime — no re-login required."
    >
      <ul className="space-y-2">
        {roles.map((role) => {
          const active = session?.role === role;
          return (
            <li
              key={role}
              className={cn(
                "flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5",
                active ? "border-primary/40 bg-primary/5" : "border-slate-200 bg-white",
              )}
            >
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">{LABELS[role] || role}</p>
                <p className="text-[11px] text-slate-500">
                  {active ? "Active now" : `Open ${LABELS[role] || role} dashboard`}
                </p>
              </div>
              {active ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                  <Check className="h-3.5 w-3.5" />
                  Active
                </span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  className="h-8 shrink-0 font-semibold"
                  disabled={Boolean(busy)}
                  onClick={() => void onSwitch(role)}
                >
                  {busy === role ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Switch
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
