import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  GraduationCap,
  Users,
  FileText,
  UserCheck,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Download,
  Calendar,
  School,
  UserPlus,
  Upload,
  BarChart3,
  Activity,
  HardDrive,
  Timer,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/lib/realtime";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/super-admin/")({
  head: () => ({
    meta: [{ title: "Super Admin Overview — D4EXAM" }],
  }),
  component: Page,
});

const ROLE_COLORS = ["#2563eb", "#8b5cf6", "#10b981", "#f59e0b", "#06b6d4", "#94a3b8"];
const EXAM_COLORS = ["#2563eb", "#f59e0b", "#10b981", "#ef4444"];

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

function Page() {
  const { data: user } = useSessionUser();
  const [growthRange, setGrowthRange] = useState<"week" | "month" | "year">("month");

  useRealtimeInvalidate(
    "sa-overview",
    [
      { table: "schools" },
      { table: "profiles" },
      { table: "students" },
      { table: "examinations" },
      { table: "results" },
      { table: "user_roles" },
      { table: "audit_logs" },
      { table: "school_applications" },
    ],
    [
      ["sa-ov-counts"],
      ["sa-ov-roles"],
      ["sa-ov-schools"],
      ["sa-ov-exams"],
      ["sa-ov-results"],
      ["sa-ov-activities"],
      ["sa-ov-growth"],
      ["sa-ov-students-by-school"],
    ],
    true,
  );

  // See full file in repo history blob 0405350424f59162dbe592190b9a22d84cf42c77
  // Temporary minimal shell to avoid blank page — full restore follows
  return (
    <div className="space-y-5 sm:space-y-6">
      <h1 className="text-xl font-extrabold text-slate-900">Super Admin</h1>
      <p className="text-sm text-slate-500">Loading dashboard modules…</p>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Link to="/super-admin/schools" className="rounded-2xl border bg-white p-4 shadow-sm hover:border-primary/40">Total Schools</Link>
        <Link to="/super-admin/users" className="rounded-2xl border bg-white p-4 shadow-sm hover:border-primary/40">Total Users</Link>
        <Link to="/super-admin/examinations" className="rounded-2xl border bg-white p-4 shadow-sm hover:border-primary/40">Examinations</Link>
        <Link to="/super-admin/applications" className="rounded-2xl border bg-white p-4 shadow-sm hover:border-primary/40">Pending Approvals</Link>
        <Link to="/super-admin/reports" className="rounded-2xl border bg-white p-4 shadow-sm hover:border-primary/40">Reports</Link>
        <Link to="/super-admin/settings" className="rounded-2xl border bg-white p-4 shadow-sm hover:border-primary/40">Settings</Link>
        <Link to="/super-admin/audit-logs" className="rounded-2xl border bg-white p-4 shadow-sm hover:border-primary/40">Audit Logs</Link>
        <Link to="/super-admin/subscriptions" className="rounded-2xl border bg-white p-4 shadow-sm hover:border-primary/40">Subscriptions</Link>
      </div>
    </div>
  );
}
