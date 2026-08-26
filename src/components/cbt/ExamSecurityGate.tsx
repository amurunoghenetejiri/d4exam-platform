import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { assertOnlineActionSync } from "@/lib/offline-guard";
import { toast } from "sonner";
import {
  Camera,
  CameraOff,
  Loader2,
  Monitor,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SchoolLogo } from "@/components/brand/SchoolLogo";
import {
  capabilitiesSnapshot,
  detectDeviceCapabilities,
  type DeviceCapabilities,
} from "@/lib/device-capabilities";
import { resolveScreenShareMode } from "@/lib/exam-security";
import type { ExamSecuritySettings } from "@/types";
import { cn } from "@/lib/utils";
import { primeHaptics } from "@/lib/haptic";
import {
  ensureCameraPermission,
  ensureMicrophonePermission,
  openCameraStream,
  requestExamMediaPermissions,
} from "@/native/cameraService";
import { canAttemptScreenShare, startScreenShareStream, stopScreenShareStream } from "@/lib/screen-share";

// FILE CONTINUES - TEMP
export function ExamSecurityGate() {
  return null;
}
