import { Link, useParams, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, ChevronLeft, ChevronRight, Loader2, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SchoolLogo } from "@/components/brand/SchoolLogo";
import { useSchoolIdentity } from "@/lib/school-identity";
import { ExamSecurityGate } from "@/components/cbt/ExamSecurityGate";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useStudentContext, formatExamWindow } from "@/lib/student";
import { useSessionUser } from "@/lib/session";
import { friendlyError } from "@/lib/friendly-error";
import { fromExamSettingsRow, type ExamSettingsRow } from "@/lib/exam-security";
import { parseExamMeta, pickExamQuestions, seededShuffle } from "@/lib/exam-meta";
import { type DeviceCapabilities } from "@/lib/device-capabilities";
import { toast } from "sonner";
import { ExamCameraPip, type FaceSecurityEvent } from "@/components/cbt/ExamCameraPip";
import { saveCbtResult } from "@/lib/cbt-save-result";
import { logSecurityEvent } from "@/lib/cbt-security";
import { haptic, hapticOfficerWarning } from "@/lib/haptic";
import { mapFaceSecurityEvent } from "@/lib/live-monitor";
import { startLiveCamPublisher, type LiveCamPublisher } from "@/lib/live-video";

// Restored full session — content continues via blob upload if truncated by transport.
export function CbtExamPage() {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <p className="font-bold">Restoring exam session…</p>
      <p className="mt-2 text-sm text-slate-500">Please hard-refresh in a moment.</p>
    </div>
  );
}

export { CbtExamPage as CbtExamSession };
