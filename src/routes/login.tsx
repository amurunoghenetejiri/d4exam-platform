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
    title: "Secure & Trusted",
    body: "Advanced security and anti-cheating technology to ensure exam integrity.",
  },
  {
    icon: Zap,
    title: "Smart & Efficient",
    body: "Powerful tools for exam management, automatic marking and analytics.",
  },
  {
    icon: Users,
    title: "For Every Institution",
    body: "Designed for schools, colleges, universities and training centres.",
  },
  {
    icon: Cloud,
    title: "Accessible Anywhere",
    body: "Access examinations, results and reports anytime, anywhere.",
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
    // School code required only for non–super-admin school logins.
    // Super admin: leave school code blank + use platform email.
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
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      if (!("session" in result) || !result.session) {
        setError("Unable to sign in. Please try again.");
        return;
      }
      await supabase.auth.setSession(result.session);
      const user = await fetchSessionUser();
      if (!user?.role) {
        setError("No role has been assigned to this account yet. Contact your administrator.");
        return;
      }
      navigate({ to: roleHome[user.role] as never });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "";
      console.error("[login] sign-in failed:", err);
      // Avoid dumping raw Zod JSON to the user
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
    <div className="relative flex min-h-dvh flex-col bg-slate-50 lg:flex-row">
      <Watermark opacity={0.08} size="xl" />

      <aside className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-[#0b1b3a] px-10 py-12 text-white lg:flex">
        <div>
          <Logo size="md" className="[&_span]:text-white" />
          <h2 className="mt-10 text-3xl font-extrabold leading-tight">Smart. Secure. Seamless.</h2>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-300">
            Sign in to access examinations, results and institutional tools for your school.
          </p>
        </div>
        <ul className="mt-10 space-y-5">
          {features.map((f) => (
            <li key={f.title} className="flex gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10">
                <f.icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-bold">{f.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{f.body}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500">© 2026 D4EXAM</p>
      </aside>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-8">
        <div className="w-full max-w-[420px] rounded-2xl border border-slate-200/80 bg-white/95 p-6 shadow-lg shadow-slate-200/50 backdrop-blur-[1px] sm:p-8">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="hidden lg:block">
              <Logo size="md" />
            </div>
            <div className="lg:hidden">
              <Logo size="sm" />
            </div>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-[1.65rem]">
              Welcome Back
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              School users need a school code. Super admins leave it blank.
            </p>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-5">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form className="space-y-4" onSubmit={submit} noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="school-code" className="text-sm font-semibold text-slate-700">
                School code{" "}
                <span className="font-normal text-slate-400">(optional for super admin)</span>
              </Label>
              <Input
                id="school-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Leave blank if you are super admin"
                className="h-11 rounded-lg border-slate-200 bg-slate-50/80 focus-visible:bg-white"
                autoComplete="organization"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="identifier" className="text-sm font-semibold text-slate-700">
                Email or matric number
              </Label>
              <Input
                id="identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Enter your email or matric number"
                className="h-11 rounded-lg border-slate-200 bg-slate-50/80 focus-visible:bg-white"
                autoComplete="username"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-semibold text-slate-700">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  autoComplete="current-password"
                  className="h-11 rounded-lg border-slate-200 bg-slate-50/80 pr-11 focus-visible:bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-slate-400 transition-colors hover:text-slate-700"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-0.5">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <Checkbox
                  id="remember"
                  checked={remember}
                  onCheckedChange={(v) => setRemember(v === true)}
                />
                <span>Remember me</span>
              </label>
              <Link
                to="/forgot-password"
                className="text-sm font-semibold text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="mt-1 h-11 w-full rounded-lg text-base font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-500">
            Need an institution account?{" "}
            <Link to="/school-application" className="font-semibold text-primary hover:underline">
              Apply here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
