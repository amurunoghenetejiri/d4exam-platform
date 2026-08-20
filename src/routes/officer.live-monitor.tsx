import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CameraOff,
  CheckCircle2,
  LayoutGrid,
  List,
  Radio,
  Search,
  ShieldAlert,
  UserRound,
  X,
  Wifi,
  WifiOff,
  MessageSquareWarning,
  Loader2,
  ChevronLeft,
} from "lucide-react";
import { PageHeader, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/lib/realtime";
import { cn } from "@/lib/utils";
import { logSecurityEvent } from "@/lib/cbt-security";
import { notifyStudentOfficerWarning } from "@/lib/notify";
import { toast } from "sonner";
import {
  faceLabel,
  formatDuration,
  humanEventLabel,
  isOnline,
  parsePresence,
  relativeTime,
  severityBadgeClass,
  severityBorderClass,
  severityFromPresence,
  type MonitorSeverity,
} from "@/lib/live-monitor";
import {
  isLiveCamFrameFresh,
  startLiveCamSubscriber,
  LIVE_CAM_STALE_MS,
  type LiveCamFramePayload,
} from "@/lib/live-video";

export const Route = createFileRoute("/officer/live-monitor")({
  head: () => ({ meta: [{ title: "Live Monitoring — D4EXAM" }] }),
  component: Page,
});

const OFFLINE_HIDE_MS = 3 * 60 * 1000;
const RECENT_SUBMIT_MS = 10 * 60 * 1000;

type AttemptRow = {
  id: string;
  exam_id: string;
  student_id: string;
  status: string;
  started_at: string | null;
  updated_at?: string | null;
  tab_switch_count: number | null;
  metadata: Record<string, unknown> | null;
  examinations: { title: string; status: string; courses: { code: string; name?: string } | null } | null;
  students: {
    full_name?: string | null;
    matric_number: string | null;
    student_id: string | null;
    profiles?: { full_name: string | null } | null;
  } | null;
};

type IntegrityEvent = {
  id: string;
  event_type: string;
  severity: string | null;
  description: string | null;
  created_at: string;
  student_id: string | null;
  exam_id: string | null;
};

type FilterKey = "all" | "normal" | "warning" | "violation" | "offline";
type FrameEntry = { src: string; ts: number };

function isFaceOrCameraLogOnly(eventType: string): boolean {
  const t = String(eventType || "").toUpperCase();
  return (
    t.includes("FACE") ||
    t.includes("CAMERA") ||
    t.includes("NO_FACE") ||
    t.includes("ONE_FACE") ||
    t.includes("MULTIPLE_FACE") ||
    t.includes("UNCLEAR")
  );
}

function doneStatusLabel(status: string): string {
  const st = String(status || "").toLowerCase();
  if (st === "submitted") return "Submitted";
  if (st === "terminated") return "Terminated";
  if (st === "flagged") return "Flagged";
  return "Ended";
}

function nameFromMetadata(meta: unknown): string {
  if (!meta || typeof meta !== "object") return "";
  const m = meta as Record<string, unknown>;
  return String(m.studentName || m.full_name || m.student_name || "").trim();
}

function studentDisplayName(a: AttemptRow): string {
  const fromMeta = nameFromMetadata(a.metadata);
  if (fromMeta) return fromMeta;
  const fromStudent = String(a.students?.full_name || "").trim();
  if (fromStudent) return fromStudent;
  const fromProfile = String(a.students?.profiles?.full_name || "").trim();
  if (fromProfile) return fromProfile;
  return a.students?.matric_number || a.students?.student_id || "Student";
}

function signalBars(
  frameTs: number | null | undefined,
  lastSeenAt: string | null | undefined,
  now = Date.now(),
): 0 | 1 | 2 | 3 | 4 {
  const frameAge = frameTs != null ? now - frameTs : Infinity;
  const seenAge = lastSeenAt ? now - new Date(lastSeenAt).getTime() : Infinity;
  if (Number.isNaN(seenAge)) return 0;
  if (frameAge <= 2_500) return 4;
  if (frameAge <= 5_000) return 3;
  if (frameAge <= LIVE_CAM_STALE_MS || seenAge <= 15_000) return 2;
  if (seenAge <= 45_000) return 1;
  return 0;
}

// TEMPORARY STUB - will be replaced in next commit with full UI from 262010a
function Page() {
  return (
    <div className="p-6">
      <PageHeader title="Live Monitoring" description="Loading full monitor…" />
      <p className="text-sm text-slate-500">Restoring… Please wait for next deploy.</p>
    </div>
  );
}
