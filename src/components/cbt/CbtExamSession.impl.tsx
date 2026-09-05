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
import { haptic, primeHaptics } from "@/lib/haptic";
import { startScreenShareStream, onScreenShareEnded, stopScreenShareStream, holdExamScreenShare } from "@/lib/screen-share";
import { useLiveScreenPublish } from "@/lib/use-live-screen-publish";
import { useLiveCamPublish } from "@/lib/use-live-cam-publish";
import { useExamAttemptHeartbeat } from "@/lib/use-exam-attempt-heartbeat";
import { isExamAttemptFinished } from "@/lib/student";

function isPreviewPath() {
  if (typeof window === "undefined") return false;
  return window.location.pathname.includes("/officer/exam-preview");
}

function stopMediaStream(stream: MediaStream | null | undefined) {
  if (!stream) return;
  try {
    for (const t of stream.getTracks()) {
      try { t.stop(); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

async function requestExamFullscreen(): Promise<boolean> {
  if (typeof document === "undefined") return false;
  await enterExamImmersive();
  if (document.fullscreenElement) return true;
  try {
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    if (el.requestFullscreen) await el.requestFullscreen();
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
  } catch { /* blocked by browser / Android policy */ }
  try {
    const { isNativeShell } = await import("@/native/platform");
    if (isNativeShell()) return true;
  } catch { /* ignore */ }
  return Boolean(document.fullscreenElement);
}

async function leaveExamFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen?.();
  } catch { /* ignore */ }
  await exitExamImmersive();
}

export function CbtExamPage() {
  const params = useParams({ strict: false }) as { id?: string };
  const id = params.id ?? "";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const previewMode = isPreviewPath();
  const { data: student } = useStudentContext();
  const { data: session } = useSessionUser();
  const { data: schoolBrand } = useSchoolIdentity(student?.schoolId ?? session?.schoolId);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const [doneTerminated, setDoneTerminated] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [seconds, setSeconds] = useState<number | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [resultId, setResultId] = useState<string | null>(null);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const [fsGate, setFsGate] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState<string>("");
  const [warnBanner, setWarnBanner] = useState<string | null>(null);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [pauseRemainingSec, setPauseRemainingSec] = useState<number | null>(null);
  const [isOfficerPause, setIsOfficerPause] = useState(false);
  const attemptIdRef = useRef<string | null>(null);
  const tabSwitchCountRef = useRef(0);
  const fullscreenExitCountRef = useRef(0);
  const lastViolationAtRef = useRef(0);
  const lastTabHiddenAtRef = useRef(0);
  const orderedIdsRef = useRef<string[] | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const cameraReconnectLockRef = useRef(false);
  const pauseUntilRef = useRef<number | null>(null);
  const endsAtRef = useRef<number | null>(null);
  const officerPauseRef = useRef(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const [liveAttemptId, setLiveAttemptId] = useState<string | null>(null);
  const finishingRef = useRef(false);
  const startedRef = useRef(false);
  const doneRef = useRef(false);
  const pausedRef = useRef(false);
  const faceStatusForLiveRef = useRef<string>("ok");
  const resultIdRef = useRef<string | null>(null);
  startedRef.current = started;
  doneRef.current = done;
  pausedRef.current = paused;
  resultIdRef.current = resultId;

  // TEMP_MARKER_PART1_END - file continued in next update if truncated
  return (
    <div className="grid min-h-dvh place-items-center bg-slate-50 p-6">
      <div className="max-w-md rounded-2xl border bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">Loading exam session…</h1>
        <p className="mt-2 text-sm text-slate-600">Please wait while the exam loads.</p>
      </div>
    </div>
  );
}

export { CbtExamPage as CbtExamSession };
