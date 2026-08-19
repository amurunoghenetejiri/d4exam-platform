import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { fetchSessionUser, roleHome } from "@/lib/session";
import { signInWithSchoolCode } from "@/lib/auth.functions";
import { ensureLoginAccount } from "@/lib/ensure-login.functions";

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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — D4EXAM" },
      { name: "description", content: "Sign in to your D4EXAM school account." },
    ],
  }),
  beforeLoad: async () => {
    try {
      const user = await fetchSessionUser();
      if (user?.role) {
        throw redirect({ to: roleHome[user.role] as never });
      }
    } catch (e) {
      if (e && typeof e === "object" && "to" in e) throw e;
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

/** Never show HTML error pages in the login alert. */
function friendlyLoginError(raw: unknown): string {
  const msg = raw instanceof Error ? raw.message : String(raw ?? "");
  if (!msg) return "Unable to sign in. Please try again.";
  const lower = msg.toLowerCase();
  if (
    lower.includes("<!doctype") ||
    lower.includes("<html") ||
    lower.includes("this page didn't load") ||
    lower.includes("something went wrong on our end") ||
    msg.length > 280
  ) {
    return "Unable to sign in right now. Please try again in a moment.";
  }
  const cleaned = msg.replace(/^Unable to sign in right now:\s*/i, "").trim();
  if (
    cleaned.toLowerCase().includes("<!doctype") ||
    cleaned.toLowerCase().includes("<html") ||
    cleaned.length > 280
  ) {
    return "Unable to sign in right now. Please try again in a moment.";
  }
  return cleaned || msg;
}

function LoginPage() {
  const navigate = useNavigate();
  const loginFn = useServerFn(signInWithSchoolCode);
  const ensureLoginFn = useServerFn(ensureLoginAccount);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const inFlight = useRef(false);

  async function goHomeAfterSession() {
    let user = await fetchSessionUser();
    for (let i = 0; i < 5 && !user?.role; i++) {
      await new Promise((r) => setTimeout(r, 120 * (i + 1)));
      user = await fetchSessionUser();
    }
    if (user?.role && user.role in roleHome) {
      navigate({ to: roleHome[user.role] as never });
      return true;
    }
    try {
      const { data: myRoles } = await supabase.rpc("get_my_roles");
      const list = Array.isArray(myRoles)
        ? myRoles.map((r: { role?: string } | string) =>
            typeof r === "string" ? r : String((r as { role?: string }).role || ""),
          )
        : [];
      const priority = [
        "super_admin",
        "school_admin",
        "examination_officer",
        "teacher",
        "student",
      ] as const;
      const found = priority.find((r) => list.map((x) => x.toLowerCase()).includes(r));
      if (found && found in roleHome) {
        navigate({ to: roleHome[found] as never });
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }

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
    let lastServerMsg = "";
    try {
      const schoolCode = code.trim().toUpperCase();
      const ident = identifier.trim();
      const pass = password;
      const looksEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ident);

      try {
        const result = await loginFn({
          data: {
            schoolCode: schoolCode || "",
            identifier: ident,
            password: pass,
          },
        });
        if (result && "session" in result && result.session?.access_token) {
          const { error: sessErr } = await supabase.auth.setSession({
            access_token: result.session.access_token,
            refresh_token: result.session.refresh_token,
          });
          if (!sessErr) {
            if (result.role && result.role in roleHome) {
              navigate({ to: roleHome[result.role as keyof typeof roleHome] as never });
              return;
            }
            if (await goHomeAfterSession()) return;
          }
        }
        if (result && "error" in result && result.error) {
          lastServerMsg = String(result.error);
        }
      } catch (serverErr) {
        console.warn("[login] server fn failed, trying client fallback", serverErr);
        lastServerMsg = friendlyLoginError(serverErr);
      }

      const emailsToTry: string[] = [];
      if (looksEmail) emailsToTry.push(ident.toLowerCase());
      if (!looksEmail && schoolCode) {
        const safeCode = schoolCode.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
        const build = (raw: string) => {
          const safe = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
          const safeDot = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, ".");
          return [
            `${safe}@${safeCode || "school"}.student.d4exam.local`,
            `${safeDot}@placeholder.local`,
            `${safe}@placeholder.local`,
          ];
        };
        for (const em of [...build(ident), ...build(pass)]) {
          if (em && !emailsToTry.includes(em)) emailsToTry.push(em);
        }
      }

      for (const email of emailsToTry) {
        const { data, error: authErr } = await supabase.auth.signInWithPassword({
          email,
          password: pass,
        });
        if (!authErr && data.session) {
          if (await goHomeAfterSession()) return;
        }
      }

      if (looksEmail) {
        try {
          const fixed = await ensureLoginFn({
            data: {
              email: ident.toLowerCase(),
              password: pass,
              schoolCode: schoolCode || null,
            },
          });
          if (fixed && "ok" in fixed && fixed.ok) {
            const { data: again, error: againErr } = await supabase.auth.signInWithPassword({
              email: ident.toLowerCase(),
              password: pass,
            });
            if (!againErr && again.session) {
              if (await goHomeAfterSession()) return;
              navigate({ to: roleHome.school_admin as never });
              return;
            }
          }
        } catch {
          /* ignore */
        }
      }

      const msg = friendlyLoginError(lastServerMsg || "Invalid login credentials.");
      setError(
        msg +
          (msg.toLowerCase().includes("unable to sign in right now")
            ? ""
            : " Check school code, email/matric/staff ID, and password. Students: password is usually your matric number."),
      );
    } catch (err) {
      console.error("[login] sign-in failed:", err);
      setError(friendlyLoginError(err));
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto grid min-h-screen max-w-6xl lg:grid-cols-2">
        <div className="relative hidden overflow-hidden bg-slate-950 lg:flex lg:flex-col lg:justify-between lg:p-12">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-600/30 via-slate-950 to-slate-950" />
          <div className="relative">
            <Logo className="h-10 w-auto text-white" />
            <p className="mt-8 max-w-sm text-lg font-semibold leading-snug text-white">
              Examination platform for modern schools
            </p>
            <p className="mt-3 max-w-sm text-sm text-slate-300">
              Secure CBT, results, and school operations in one place.
            </p>
          </div>
          <div className="relative grid gap-4">
            {features.map((f) => (
              <div key={f.title} className="flex gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <f.icon className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" />
                <div>
                  <p className="text-sm font-semibold text-white">{f.title}</p>
                  <p className="text-xs text-slate-300">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col justify-center px-4 py-10 sm:px-8">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8 flex items-center gap-2 lg:hidden">
              <Logo className="h-9 w-auto" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Sign in</h1>
            <p className="mt-1 text-sm text-slate-500">Enter your credentials to continue.</p>

            {error ? (
              <Alert variant="destructive" className="mt-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="school-code">School code</Label>
                <Input
                  id="school-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Leave blank for super admin"
                  className="h-11"
                  autoComplete="organization"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="identifier">Email / matric / staff ID</Label>
                <Input
                  id="identifier"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="you@email.com or matric number"
                  className="h-11"
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    to="/forgot-password"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 pr-10"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
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
                <Label htmlFor="remember" className="text-sm font-normal text-slate-600">
                  Remember this device
                </Label>
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

            <p className="mt-6 text-center text-sm text-slate-500">
              New institution?{" "}
              <Link to="/school-application" className="font-semibold text-primary hover:underline">
                Apply for school
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
