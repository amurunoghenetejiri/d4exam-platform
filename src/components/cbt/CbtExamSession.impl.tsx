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
import { ExamCameraPip, type FaceSecurityEvent } from "@/components/cbt/ExamCameraPip";
import { saveCbtResult } from "@/lib/cbt-save-result";
import { logSecurityEvent } from "@/lib/cbt-security";
import { mapFaceSecurityEvent } from "@/lib/live-monitor";
import { openCameraStream, ensureMicrophonePermission } from "@/native/cameraService";
import { enterExamImmersive, exitExamImmersive } from "@/native/statusBar";
import { haptic } from "@/lib/haptic";
import { startScreenShareStream, onScreenShareEnded, stopScreenShareStream, holdExamScreenShare } from "@/lib/screen-share";
import { useLiveScreenPublish } from "@/lib/use-live-screen-publish";
import { useLiveCamPublish } from "@/lib/use-live-cam-publish";
import { useExamAttemptHeartbeat } from "@/lib/use-exam-attempt-heartbeat";
import { isExamAttemptFinished } from "@/lib/student";

function isPreviewPath() {
  if (typeof window === "undefined") return false;
  return window.location.pathname.includes("/officer/exam-preview");
}

// PLACEHOLDER_PARTIAL - full file will be restored via force-push of b89c7bef
export function CbtExamPage() {
  return null;
}
export { CbtExamPage as CbtExamSession };
