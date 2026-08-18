import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { signInWithSchoolCode } from "@/lib/auth.functions";
import { fetchSessionUser, roleHome } from "@/lib/session";

import {
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  Zap,
  Users,
  Cloud,
  ArrowRight,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Watermark } from "@/components/brand/Watermark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Login — D4EXAM" },
      {
        name: "description",
        content:
          "Sign in to your institution's D4EXAM account with your school code and credentials.",
      },
    ],
  }),
  beforeLoad: async () => {
    const user = await fetchSessionUser();
    if (user?.role) {
      throw redirect({ to: roleHome[user.role] as never });
    }
  },
  component: LoginPage,
});

const features = [
  {
    icon: ShieldCheck,
    title: "Secure by design",
    desc: "Proctored exams with integrity controls built in.",
  },
  {
    icon: Zap,
    title: "Fast CBT",
    desc: "Smooth exam experience on phone and desktop.",
  },
  {
    icon: Users,
    title: "Whole school",
    desc: "Students, teachers, officers and admins in one place.",
  },
  {
    icon: Cloud,
    title: "Cloud ready",
    desc: "Works anywhere with a stable internet connection.",
  },
];

function LoginPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const signIn = useServerFn(signInWithSchoolCode);
  const inFlight = useRef(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current || loading) return;
    setError("");
    if (!identifier.trim() || !password.trim()) {
      setError("Enter your email / name / matric and password to continue.");
      return;
    }
    inFlight.current = true;
    setLoading(true);
    try {
      const result = await signIn({
        data: {
          schoolCode: code.trim(),
          identifier: identifier.trim(),
          password,
        },
      });
      // Session may still be present even when role is missing — set it first
      if ("session" in result && result.session) {
        const { error: sessErr } = await supabase.auth.setSession(result.session);
        if (sessErr) {
          console.error("[login] setSession failed", sessErr);
          setError(sessErr.message || "Could not establish session. Try again.");
          return;
        }
      }

      if ("error" in result && result.error) {
        // Auth succeeded but no role (or other soft error)
        setError(result.error);
        return;
      }
      if (!("session" in result) || !result.session) {
        setError("Unable to sign in. Please try again.");
        return;
      }

      // Prefer role from server — avoids client RLS race after setSession
      const serverRole = "role" in result && result.role ? String(result.role).toLowerCase() : null;
      if (serverRole && serverRole in roleHome) {
        navigate({ to: roleHome[serverRole as keyof typeof roleHome] as never });
        return;
      }

      // Client fallback with short retries
      let user = await fetchSessionUser();
      for (let i = 0; i < 3 && !user?.role; i++) {
        await new Promise((r) => setTimeout(r, 200 * (i + 1)));
        user = await fetchSessionUser();
      }
      if (!user?.role) {
        try {
          const { data: isSuper } = await supabase.rpc("is_super_admin");
          if (isSuper === true) {
            navigate({ to: roleHome.super_admin as never });
            return;
          }
        } catch {
          /* ignore */
        }
        setError(
          "Signed in, but no dashboard role was found for this account. Contact your school administrator to assign school_admin, teacher, officer, or student.",
        );
        return;
      }
      navigate({ to: roleHome[user.role] as never });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "";
      console.error("[login] sign-in failed:", err);
      const friendly =
        detail.includes("schoolCode") || detail.includes("too_small")
          ? "School code is required for school accounts. Super admins leave school code blank and sign in with email only."
          : detail
            ? `Unable to sign in right now: ${detail}`
            : "Unable to sign in right now. Check your connection and try again.";
      setError(friendly);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#0a1628]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(37,99,235,0.18),_transparent_50%),radial-gradient(ellipse_at_bottom_left,_rgba(14,165,233,0.12),_transparent_45%)]" />
      <Watermark />

      <div className="relative z-10 mx-auto grid min-h-dvh max-w-6xl lg:grid-cols-2">
        {/* Brand panel */}
        <div className="hidden flex-col justify-between p-10 text-white lg:flex">
          <div>
            <Logo variant="full" className="h-10" />
            <h1 className="mt-12 text-3xl font-extrabold leading-tight tracking-tight">
              Examination platform
              <br />
              for modern schools
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-300">
              Secure CBT, live monitoring, and results — built for students, teachers, officers and
              administrators.
            </p>
          </div>
          <ul className="space-y-4">
            {features.map((f) => (
              <li key={f.title} className="flex gap-3">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10">
                  <f.icon className="h-4 w-4 text-sky-300" />
                </span>
                <div>
                  <p className="text-sm font-bold">{f.title}</p>
                  <p className="text-xs text-slate-400">{f.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Form panel */}
        <div className="flex items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white p-6 shadow-2xl sm:p-8">
            <div className="mb-6 text-center lg:hidden">
              <Logo variant="full" className="mx-auto h-9" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-900">Sign in</h2>
            <p className="mt-1 text-sm text-slate-500">
              Use your school code and account credentials.
            </p>

            {error ? (
              <Alert variant="destructive" className="mt-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="schoolCode" className="text-xs font-semibold text-slate-700">
                  School code
                </Label>
                <Input
                  id="schoolCode"
                  autoComplete="organization"
                  placeholder="e.g. D4UNI (leave blank for super admin)"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="identifier" className="text-xs font-semibold text-slate-700">
                  Email / matric / staff ID
                </Label>
                <Input
                  id="identifier"
                  autoComplete="username"
                  placeholder="you@school.edu or matric number"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="h-11"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-semibold text-slate-700">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 pr-10"
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-400 hover:text-slate-600"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember"
                  checked={remember}
                  onCheckedChange={(v) => setRemember(v === true)}
                />
                <label htmlFor="remember" className="text-xs text-slate-600">
                  Remember this device
                </label>
              </div>

              <Button type="submit" className="h-11 w-full font-semibold" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…
                  </>
                ) : (
                  <>
                    Sign in <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <p className="mt-6 text-center text-xs text-slate-500">
              New institution?{" "}
              <Link to="/register" className="font-semibold text-primary hover:underline">
                Register school
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
