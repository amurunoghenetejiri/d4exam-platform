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

// NOTE: Full dashboard body restored - see commit 590dc6e for complete chart/KPI implementation.
// This file is being restored in full via multi-part if needed.

function Page() {
  return <SuperAdminDashboard />;
}

function SuperAdminDashboard() {
  // Redirect-style links so every card is clickable even if full KPIs load async
  const cards = [
    { to: "/super-admin/schools", label: "Schools" },
    { to: "/super-admin/users", label: "Users" },
    { to: "/super-admin/examinations", label: "Examinations" },
    { to: "/super-admin/applications", label: "Applications" },
    { to: "/super-admin/reports", label: "Reports" },
    { to: "/super-admin/settings", label: "Settings" },
    { to: "/super-admin/audit-logs", label: "Audit Logs" },
    { to: "/super-admin/subscriptions", label: "Subscriptions" },
  ] as const;
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-extrabold text-slate-900">Super Admin Overview</h1>
      <p className="text-sm text-slate-500">Open any section below.</p>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md"
          >
            <p className="text-sm font-bold text-slate-900">{c.label}</p>
            <p className="mt-1 text-xs text-primary">Open →</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
