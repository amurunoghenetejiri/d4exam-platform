import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!identifier.trim() || !password.trim()) {
      setError("Enter your ID / email and password to continue.");
      return;
    }
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
    } catch {
      setError("Unable to sign in right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* ── Left brand panel (desktop) ─────────────────────────────── */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#070d1b] px-10 py-10 text-white lg:flex xl:px-14">
        {/* Soft decorative glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 top-1/4 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-16 bottom-0 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl"
        />

        <div className="relative z-10">
          <Link to="/" aria-label="D4EXAM home">
            <Logo size="lg" className="[&_span]:text-white" />
          </Link>
        </div>

        <div className="relative z-10 max-w-md space-y-8 py-10">
          <div>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight xl:text-4xl">
              Secure. Reliable.
              <br />
              <span className="text-emerald-400">Built for Examinations.</span>
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-slate-300 xl:text-base">
              D4EXAM is a professional online examination and assessment platform trusted by
              schools, colleges and institutions worldwide.
            </p>
          </div>

          <ul className="space-y-5">
            {features.map((f) => (
              <li key={f.title} className="flex gap-3">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25">
                  <f.icon className="h-4.5 w-4.5" strokeWidth={2.25} aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{f.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{f.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-xs text-slate-500">
          © {new Date().getFullYear()} D4EXAM. All rights reserved.
        </p>
      </aside>

      {/* ── Right / main form panel ────────────────────────────────── */}
      <div className="relative flex flex-col bg-slate-50">
        {/* Subtle watermark */}
        <Watermark opacity={0.05} size="lg" />

        {/* Mobile-only dark header */}
        <div className="relative z-10 bg-[#070d1b] px-5 pb-8 pt-6 text-center text-white lg:hidden">
          <Link to="/" className="inline-flex" aria-label="D4EXAM home">
            <Logo size="lg" className="[&_span]:text-white" />
          </Link>
          <p className="mt-3 text-sm font-medium text-slate-300">
            Smart Examinations, Better Results.
          </p>
        </div>

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-8">
          <div className="w-full max-w-[420px] rounded-2xl border border-slate-200/80 bg-white p-6 shadow-lg shadow-slate-200/50 sm:p-8">
            <div className="mb-6 flex flex-col items-center text-center">
              <div className="hidden lg:block">
                <Logo size="md" />
              </div>
              <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-[1.65rem]">
                Welcome Back
              </h1>
              <p className="mt-1.5 text-sm text-slate-500">Sign in to access your account</p>
            </div>

            {error && (
              <Alert variant="destructive" className="mb-5">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form className="space-y-4" onSubmit={submit} noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="school-code" className="text-sm font-semibold text-slate-700">
                  School / Institution Code
                </Label>
                <Input
                  id="school-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Enter school code"
                  className="h-11 rounded-lg border-slate-200 bg-slate-50/80 focus-visible:bg-white"
                  autoComplete="organization"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="identifier" className="text-sm font-semibold text-slate-700">
                  Student ID / Matric No. / Staff ID / Email
                </Label>
                <Input
                  id="identifier"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Enter your ID or email"
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
                    placeholder="Enter your password"
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
                  className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="mt-1 h-11 w-full rounded-lg bg-emerald-500 text-base font-semibold text-white shadow-md shadow-emerald-500/25 hover:bg-emerald-600 focus-visible:ring-emerald-500"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    Signing in…
                  </>
                ) : (
                  <>
                    Login
                    <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
                  </>
                )}
              </Button>
            </form>

            <p className="mt-5 text-center text-xs text-slate-500">
              By signing in, you agree to our{" "}
              <Link to="/privacy" className="font-medium text-slate-700 hover:underline">
                Privacy Policy
              </Link>
            </p>

            <p className="mt-4 text-center text-sm text-slate-600">
              Need help?{" "}
              <Link to="/support" className="font-semibold text-emerald-600 hover:underline">
                Contact Support
              </Link>
            </p>
          </div>

          <p className="mt-6 hidden text-center text-xs text-slate-400 lg:block">
            <Link to="/privacy" className="hover:text-slate-600 hover:underline">
              Privacy Policy
            </Link>
            <span className="mx-2">·</span>
            <Link to="/support" className="hover:text-slate-600 hover:underline">
              Support
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
