import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Camera,
  Loader2,
  Mic,
  Monitor,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
import {
  capabilitiesSnapshot,
  detectDeviceCapabilities,
  type DeviceCapabilities,
} from "@/lib/device-capabilities";
import { resolveScreenShareMode } from "@/lib/exam-security";
import type { ExamSecuritySettings } from "@/types";
import { cn } from "@/lib/utils";

type Props = {
  examTitle: string;
  courseLine: string;
  durationMinutes: number;
  totalQuestions: number;
  security: ExamSecuritySettings;
  busy: boolean;
  onStart: (opts: {
    skipScreenShare: boolean;
    caps: DeviceCapabilities;
  }) => void | Promise<void>;
};

function CheckRow({
  ok,
  label,
  detail,
}: {
  ok: boolean | "na";
  label: string;
  detail?: string;
}) {
  return (
    <li className="flex items-start justify-between gap-3 text-sm">
      <span className="text-slate-700">{label}</span>
      <span
        className={cn(
          "shrink-0 text-right text-xs font-semibold",
          ok === true && "text-emerald-600",
          ok === false && "text-amber-700",
          ok === "na" && "text-slate-400",
        )}
      >
        {ok === true ? "✓ Ready" : ok === false ? "✗ Not available" : detail || "—"}
      </span>
    </li>
  );
}

export function ExamSecurityGate({
  examTitle,
  courseLine,
  durationMinutes,
  totalQuestions,
  security,
  busy,
  onStart,
}: Props) {
  const caps = useMemo(() => detectDeviceCapabilities(), []);
  const [acknowledgedUnsupported, setAcknowledgedUnsupported] = useState(false);

  const shareMode = resolveScreenShareMode(security);
  const needCam = security.requireCamera;
  const needMic = security.requireMicrophone;
  const needFace = needCam && security.faceDetection;

  const screenSupported = caps.screenShare;
  const blockedByRequired =
    shareMode === "required" && !screenSupported && !acknowledgedUnsupported;

  // Required + unsupported → hard block (no acknowledge path that bypasses required)
  const hardBlock = shareMode === "required" && !screenSupported;

  const willRequestScreen =
    screenSupported && (shareMode === "required" || shareMode === "optional");

  const buttonLabel = (() => {
    if (busy) return null;
    if (hardBlock) return "Cannot start on this device";
    if (willRequestScreen && shareMode === "required") return "Share Screen & Continue";
    if (willRequestScreen && shareMode === "optional") return "Continue (screen optional)";
    if (needCam) return "Allow camera & start exam";
    return "Begin examination";
  })();

  return (
    <div className="grid min-h-dvh place-items-center bg-slate-50 p-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <Logo size="lg" />
        <h1 className="mt-4 text-xl font-extrabold text-primary">{examTitle}</h1>
        <p className="mt-1 text-sm font-semibold text-primary/80">{courseLine}</p>

        <p className="mt-3 text-xs text-slate-500">
          Detected: <strong className="text-slate-700">{caps.deviceType}</strong> ·{" "}
          <strong className="text-slate-700">{caps.browserName}</strong>
          {!caps.secureContext && (
            <span className="text-amber-700"> · insecure context (HTTPS recommended)</span>
          )}
        </p>

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
            <ShieldCheck className="h-4 w-4 text-primary" />
            SECURITY CHECK
          </p>
          <ul className="mt-3 space-y-2">
            <CheckRow
              ok={!needCam ? "na" : caps.camera}
              label="Camera"
              detail={!needCam ? "Not required" : undefined}
            />
            <CheckRow
              ok={!needFace ? "na" : caps.faceDetection}
              label="Face detection"
              detail={!needFace ? "Off" : undefined}
            />
            <CheckRow
              ok={
                shareMode === "disabled"
                  ? "na"
                  : screenSupported
                    ? true
                    : false
              }
              label={`Screen sharing (${shareMode})`}
              detail={shareMode === "disabled" ? "Disabled" : undefined}
            />
            <CheckRow
              ok={!needMic ? "na" : caps.microphone}
              label="Microphone"
              detail={!needMic ? "Not required" : undefined}
            />
          </ul>
        </div>

        {/* Unsupported screen share — professional message */}
        {(shareMode === "required" || shareMode === "optional") && !screenSupported && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <p className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
              <Smartphone className="h-4 w-4 text-primary" />
              Screen Monitoring Unavailable
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Your current device or browser does not support screen sharing.
            </p>
            {shareMode === "required" ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                This examination <strong>requires</strong> a desktop or laptop browser with
                screen-sharing support. Please switch to a supported browser on a computer.
              </p>
            ) : (
              <p className="mt-3 text-xs text-slate-500">
                You can continue with the other available security features.
              </p>
            )}
            <p className="mt-3 text-xs font-semibold text-slate-700">For high-security examinations, use:</p>
            <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
              <li>• Google Chrome (Desktop)</li>
              <li>• Microsoft Edge (Desktop)</li>
              <li>• Firefox (Desktop)</li>
            </ul>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg bg-emerald-50 px-2 py-2 text-emerald-800">
                <p className="font-bold">Available</p>
                <p>✓ Camera Monitoring</p>
                <p>✓ Face Detection</p>
                <p>✓ Tab Monitoring</p>
                <p>✓ Fullscreen Mode</p>
                <p>✓ Copy/Paste Protection</p>
              </div>
              <div className="rounded-lg bg-slate-100 px-2 py-2 text-slate-600">
                <p className="font-bold">Screen Sharing</p>
                <p>✗ Not Available</p>
              </div>
            </div>
          </div>
        )}

        {screenSupported && shareMode !== "disabled" && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
            <Monitor className="h-3.5 w-3.5" />
            ✓ Screen Sharing Available
          </div>
        )}

        <ul className="mt-4 space-y-1 text-sm text-slate-600">
          <li>
            Duration: <strong>{durationMinutes} minutes</strong>
          </li>
          <li>
            Questions to answer: <strong>{totalQuestions}</strong>
          </li>
        </ul>

        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          Monitoring helps maintain exam integrity. It does not guarantee absolute prevention of
          misconduct. Device and browser details are logged for authorised review.
        </p>

        {totalQuestions === 0 ? (
          <p className="mt-4 text-sm text-amber-700">No questions on this exam paper yet.</p>
        ) : (
          <Button
            className="mt-6 w-full font-semibold"
            disabled={busy || hardBlock}
            onClick={() =>
              void onStart({
                skipScreenShare: !willRequestScreen || (shareMode === "optional" && !screenSupported),
                caps,
              })
            }
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing…
              </>
            ) : (
              buttonLabel
            )}
          </Button>
        )}
        <Button variant="ghost" className="mt-2 w-full" asChild>
          <Link to="/student/examinations">Cancel</Link>
        </Button>

        {/* keep snapshot available for callers via data attribute for debugging */}
        <span className="sr-only" data-caps={JSON.stringify(capabilitiesSnapshot(caps))} />
      </div>
    </div>
  );
}
