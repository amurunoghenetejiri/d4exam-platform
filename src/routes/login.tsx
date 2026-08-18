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
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      if (!("session" in result) || !result.session) {
        setError("Unable to sign in. Please try again.");
        return;
      }
      await supabase.auth.setSession(result.session);

      // Prefer role from server (service-role) — avoids client RLS race
      const serverRole = "role" in result && result.role ? String(result.role) : null;
      if (serverRole && serverRole in roleHome) {
        navigate({ to: roleHome[serverRole as keyof typeof roleHome] as never });
        return;
      }

      await new Promise((r) => setTimeout(r, 150));
      let user = await fetchSessionUser();
      if (!user?.role) {
        await new Promise((r) => setTimeout(r, 300));
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
        setError("No role has been assigned to this account yet. Contact your administrator.");
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
    <div className="relative min-h-[100dvh] overflow-hidden bg-slate-50">
      <Watermark />
      <div className="relative mx-auto grid min-h-[100dvh] max-w-6xl lg:grid-cols-2">
        <aside className="hidden flex-col justify-between bg-slate-900 px-10 py-12 text-white lg:flex">
          <div>
            <Logo className="h-10 w-auto" />
            <h2 className="mt-10 text-3xl font-extrabold tracking-tight">Welcome back</h2>
            <p className="mt-3 max-w-sm text-slate-300">
              Sign in with your school code and credentials to access exams, results and admin tools.
            </p>
            <ul className="mt-10 space-y-5">
              {features.map((f) => (
                <li key={f.title} className="flex gap-3">
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10">
                    <f.icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-semibold">{f.title}</p>
                    <p className="text-sm text-slate-400">{f.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-slate-500">D4EXAM · Secure computer-based testing</p>
        </aside>

        <div className="flex items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-6 text-center lg:hidden">
              <Logo className="mx-auto h-9 w-auto" />
            </div>
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h1 className="text-2xl font-extrabold text-slate-900">Welcome Back</h1>
              <p className="mt-1 text-sm text-slate-500">
                School users need a school code. Super admins leave it blank.
              </p>
            </div>

            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-2">
                <Label htmlFor="schoolCode">School code (optional for super admin)</Label>
                <Input
                  id="schoolCode"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Leave blank if you are super admin"
                  autoComplete="organization"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="identifier">Email or matric number</Label>
                <Input
                  id="identifier"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="you@school.edu or matric number"
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    autoComplete="current-password"
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
                  Remember me
                </label>
                <Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Button type="submit" className="w-full font-semibold" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Sign In
                {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-500">
              Need an institution account?{" "}
              <Link to="/school-application" className="font-semibold text-primary hover:underline">
                Apply here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
