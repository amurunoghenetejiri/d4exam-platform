import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  Users,
  Blocks,
  GraduationCap,
  BookOpen,
  FileText,
  ChevronRight,
  Loader2,
  UserCheck,
  Activity,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { SchoolLogo } from "@/components/brand/SchoolLogo";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/lib/session";

export const Route = createFileRoute("/super-admin/schools/$id")({
  validateSearch: (
    s: Record<string, unknown>,
  ): { tab?: string; faculty?: string; department?: string; level?: string } => ({
    tab: typeof s.tab === "string" ? s.tab : undefined,
    faculty: typeof s.faculty === "string" ? s.faculty : undefined,
    department: typeof s.department === "string" ? s.department : undefined,
    level: typeof s.level === "string" ? s.level : undefined,
  }),
  head: () => ({ meta: [{ title: "School Overview — D4EXAM" }] }),
  component: Page,
});

type Tab =
  | "overview"
  | "users"
  | "faculties"
  | "departments"
  | "students"
  | "teachers"
  | "exams"
  | "results"
  | "activity";

function Page() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const tab = (search.tab as Tab) || "overview";
  const facultyId = search.faculty ?? null;
  const departmentId = search.department ?? null;
  const levelId = search.level ?? null;

  function setTab(next: Tab) {
    void navigate({
      to: "/super-admin/schools/$id",
      params: { id },
      search: { tab: next === "overview" ? undefined : next },
    });
  }

  function goStructure(next: {
    tab?: Tab;
    faculty?: string;
    department?: string;
    level?: string;
  }) {
    void navigate({
      to: "/super-admin/schools/$id",
      params: { id },
      search: {
        tab: next.tab ?? "faculties",
        faculty: next.faculty,
        department: next.department,
        level: next.level,
      },
    });
  }

  const qc = useQueryClient();
  const { data: session } = useSessionUser();
  const [mgmtBusy, setMgmtBusy] = useState(false);

  const schoolQ = useQuery({
    queryKey: ["sa-school", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("id, name, school_code, country, logo_url, subscription_plan, status, created_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        name: string;
        school_code: string | null;
        country: string | null;
        logo_url: string | null;
        subscription_plan: string | null;
        status: string;
        created_at: string | null;
      } | null;
    },
  });

  async function setSchoolStatus(
    next: "active" | "suspended" | "blocked" | "revoked",
    confirmMsg: string,
  ) {
    if (!schoolQ.data) return;
    const reasonRaw = window.prompt(`${confirmMsg}\n\nOptional reason:`);
    if (reasonRaw === null) return; // cancelled
    const reason = reasonRaw.trim();
    const ok = window.confirm(
      `Confirm set status to "${next}" for ${schoolQ.data.name}?${reason ? `\nReason: ${reason}` : ""}`,
    );
    if (!ok) return;
    setMgmtBusy(true);
    try {
      const { error } = await supabase
        .from("schools")
        .update({ status: next } as never)
        .eq("id", id);
      if (error) throw error;
      try {
        await supabase.from("audit_logs").insert({
          school_id: id,
          actor_user_id: session?.userId ?? null,
          action: `SCHOOL_${next.toUpperCase()}`,
          entity_type: "school",
          entity_id: id,
          details: { reason: reason || null, school_name: schoolQ.data.name },
        } as never);
      } catch {
        /* audit optional */
      }
      await qc.invalidateQueries({ queryKey: ["sa-school", id] });
      await qc.invalidateQueries({ queryKey: ["sa-schools-list"] });
      toast.success(`School marked ${next}`);
    } catch (e) {
      toast.error((e as Error).message || "Could not update school status");
    } finally {
      setMgmtBusy(false);
    }
  }

  // PLACEHOLDER_REST_OF_FILE
}
