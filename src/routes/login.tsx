import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { signInWithSchoolCode } from "@/lib/auth.functions";
import {
  confirmSessionReady,
  fetchSessionUser,
  roleHome,
  seedPendingLoginRole,
  type SessionUser,
} from "@/lib/session";

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
  const queryClient = useQueryClient();
  const [showPw, setShowPw] = useState(false);
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
        setError(result.error);
        return;
      }
      if (!("session" in result) || !result.session) {
        setError("Unable to sign in. Please try again.");
        return;
      }

      // Ensure local session is readable before any guarded route runs requireRole
      const ready = await confirmSessionReady();
      if (!ready) {
        setError("Session could not be established. Please try signing in again.");
        return;
      }

      // Prefer role from server — avoids client RLS race after setSession
      const serverRole =
        "role" in result && result.role ? String(result.role).toLowerCase() : null;

      const goHome = async (path: string, roleHint?: string, seeded?: SessionUser | null) => {
        if (roleHint) seedPendingLoginRole(roleHint);
        // Seed React Query so requireRole never sees a stale null after login
        try {
          if (seeded?.role) {
            queryClient.setQueryData(["session-user"], seeded);
          } else {
            queryClient.removeQueries({ queryKey: ["session-user"] });
          }
        } catch {
          /* ignore */
        }
        // Hard navigation avoids SPA beforeLoad races right after setSession
        if (typeof window !== "undefined") {
          window.location.replace(path);
          return;
        }
        await navigate({ to: path as never });
      };

      if (serverRole && serverRole in roleHome) {
        // Best-effort profile hydrate; do not block redirect on slow RLS
        let seeded: SessionUser | null = null;
        try {
          seeded = await fetchSessionUser();
        } catch {
          /* ignore */
        }
        if (!seeded?.role) {
          try {
            const { data: sess } = await supabase.auth.getSession();
            const u = sess.session?.user;
            if (u) {
              seeded = {
                userId: u.id,
                profileId: u.id,
                email: u.email || "",
                fullName: u.email || "User",
                status: "active",
                schoolId: null,
                schoolName: null,
                schoolCode: null,
                schoolLogoUrl: null,
                roles: [serverRole as NonNullable<SessionUser["role"]>],
                role: serverRole as NonNullable<SessionUser["role"]>,
                identifier: u.email || null,
                identifierLabel: "Email",
              };
            }
          } catch {
            /* ignore */
          }
        }
        await goHome(roleHome[serverRole as keyof typeof roleHome], serverRole, seeded);
        return;
      }

      let user = await fetchSessionUser();
      for (let i = 0; i < 6 && !user?.role; i++) {
        await new Promise((r) => setTimeout(r, 200 * (i + 1)));
        user = await fetchSessionUser();
      }
      if (!user?.role) {
        try {
          const { data: isSuper } = await supabase.rpc("is_super_admin");
          if (isSuper === true) {
            await goHome(roleHome.super_admin, "super_admin", user);
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
      await goHome(roleHome[user.role], user.role, user);
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
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-300">
              Sign in with your school code and credentials to access exams, results and admin tools.
            </p>
          </div>
          <ul className="space-y-4">
            {features.map((f) => (
              <li key={f.title} className="flex gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10">
                  <f.icon className="h-4 w-4 text-sky-300" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{f.title}</p>
                  <p className="text-xs text-slate-400">{f.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        <main className="flex items-center justify-center px-5 py-10 sm:px-10">
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <Logo className="h-9 w-auto" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Sign in</h1>
            <p className="mt-1 text-sm text-slate-500">
              Use your school code and account credentials.
            </p>

            {error ? (
              <Alert variant="destructive" className="mt-5">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="school-code">School code</Label>
                <Input
                  id="school-code"
                  autoComplete="organization"
                  placeholder="e.g. ABC123 (leave blank for super admin)"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="identifier">Email / Matric / Staff ID</Label>
                <Input
                  id="identifier"
                  autoComplete="username"
                  placeholder="email, matric or staff ID"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="h-11"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 pr-11"
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember"
                  checked={remember}
                  onCheckedChange={(v) => setRemember(v === true)}
                />
                <Label htmlFor="remember" className="text-sm font-normal text-slate-600">
                  Remember me on this device
                </Label>
              </div>

              <Button type="submit" className="h-11 w-full font-semibold" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-500">
              New school?{" "}
              <Link to="/apply" className="font-semibold text-sky-700 hover:underline">
                Apply for D4EXAM
              </Link>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
