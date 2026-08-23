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
import { parseExamMeta } from "@/lib/exam-meta";
import { loadExamQuestionBank, prepareStudentPaper } from "@/lib/cbt-load-questions";
import { type DeviceCapabilities } from "@/lib/device-capabilities";
import { toast } from "sonner";
import { hapticOfficerWarning, primeHaptics, refreshHapticUnlock, startHapticKeepAlive, stopHapticKeepAlive } from "@/lib/haptic";
import { ExamCameraPip, type FaceSecurityEvent } from "@/components/cbt/ExamCameraPip";
import { saveCbtResult } from "@/lib/cbt-save-result";
import { logSecurityEvent } from "@/lib/cbt-security";
import { mapFaceSecurityEvent } from "@/lib/live-monitor";
import { startLiveCamPublisher, type LiveCamPublisher } from "@/lib/live-video";

/*
 * IMPORTANT: Full implementation was temporarily corrupted during a header CSS patch.
 * Please restore the complete file from git commit c5cdc765ff2d863e7985f654bfaf1ae66fcff36f:
 *
 *   git checkout c5cdc765ff2d863e7985f654bfaf1ae66fcff36f -- src/components/cbt/CbtExamSession.impl.tsx
 *
 * The PIP camera drag fix is already in ExamCameraPip.tsx and is independent of this file.
 */

export function CbtExamPage() {
  const params = useParams({ strict: false }) as { id?: string };
  return (
    <div className="grid min-h-dvh place-items-center bg-slate-50 p-6 text-center">
      <div className="max-w-md space-y-4">
        <p className="text-lg font-extrabold text-slate-900">Examination module needs a quick restore</p>
        <p className="text-sm text-slate-600">
          The exam session file was interrupted during an update. Restore it from GitHub, then refresh this page.
        </p>
        <Button asChild className="font-semibold">
          <Link to="/student/examinations">Back to examinations</Link>
        </Button>
        <p className="text-xs text-slate-400">Exam id: {params.id || "—"}</p>
      </div>
    </div>
  );
}

export { CbtExamPage as CbtExamSession };
