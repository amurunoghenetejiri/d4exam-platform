import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { fetchSessionUser, roleHome, type AppRole } from "@/lib/session";
import { signInWithSchoolCode } from "@/lib/auth.functions";
import { ensureLoginAccount } from "@/lib/ensure-login.functions";

import {
  Eye,
  EyeOff,
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
      const user = await Promise.race([
        fetchSessionUser(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3_000)),
      ]);
      if (user?.role && user.role in roleHome) {
        throw redirect({ to: roleHome[user.role] as never });
      }
    } catch (e) {
      if (
        e &&
        typeof e === "object" &&
        ("to" in e || (e as { isRedirect?: boolean }).isRedirect)
      ) {
        throw e;
      }
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

function friendlyLoginError(raw: unknown): string {
  const msg = raw instanceof Error ? raw.message : String(raw ?? "");
  if (!msg) return "Unable to sign in. Please try again.";
  const lower = msg.toLowerCase();
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("timed out") ||
    lower.includes("timeout")
  ) {
    return "Network error. Check your internet connection and try again.";
  }
  if (lower.includes("invalid login") || lower.includes("invalid email or password")) {
    return "Invalid email or password. School accounts must enter a school code. Super admins leave school code blank.";
  }
  if (lower.includes("email not confirmed")) {
    return "Please confirm your email before signing in.";
  }
  if (lower.includes("no role")) {
    return "No role has been assigned to this account yet. Contact your school admin.";
  }
  return msg.length > 180 ? `${msg.slice(0, 180)}…` : msg;
}

function goToRoleHome(role: string) {
  const path = roleHome[role as AppRole];
  if (!path) return false;
  window.location.assign(path);
  return true;
}

function LoginPage() {
  const loginFn = useServerFn(signInWithSchoolCode);
  const ensureLoginFn = useServerFn(ensureLoginAccount);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);
  const identifierRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [remember, setRemember] = useState(false);
  const inFlight = useRef(false);

  async function resolveRoleAndGoHome(): Promise<boolean> {
    try {
      const user = await Promise.race([
        fetchSessionUser(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2_500)),
      ]);
      if (user?.role && user.role in roleHome) {
        return goToRoleHome(user.role);
      }
    } catch {
      /* continue */
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
      if (found) return goToRoleHome(found);
    } catch {
      /* ignore */
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .limit(10);
        const list = (roles ?? []).map((r) => String(r.role).toLowerCase());
        const priority = [
          "super_admin",
          "school_admin",
          "examination_officer",
          "teacher",
          "student",
        ] as const;
        const found = priority.find((r) => list.includes(r));
        if (found) return goToRoleHome(found);
      }
    } catch {
      /* ignore */
    }

    return false;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (inFlight.current || loading) return;
    setError("");
    const code = (codeRef.current?.value ?? "").trim();
    const identifier = (identifierRef.current?.value ?? "").trim();
    const password = passwordRef.current?.value ?? "";
    if (!identifier.trim() || !password.trim()) {
      setError("Enter your email / name / matric and password to continue.");
      return;
    }
    inFlight.current = true;
    setLoading(true);

    try {
      const schoolCode = code.toUpperCase();
      const ident = identifier;
      const pass = password;
      const looksEmail = ident.includes("@");

      let lastServerMsg = "";
      try {
        const result = await loginFn({
          data: {
            schoolCode: schoolCode || "",
            identifier: ident,
            password: pass,
          },
        });
        if (result?.role && result.role in roleHome) {
          goToRoleHome(result.role);
          return;
        }
        if (await resolveRoleAndGoHome()) return;
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
          if (await resolveRoleAndGoHome()) return;
        }
      }

      try {
        await ensureLoginFn({
          data: {
            schoolCode: schoolCode || "",
            identifier: ident,
            password: pass,
          },
        });
        if (await resolveRoleAndGoHome()) return;
      } catch {
        /* ignore */
      }

      setError(
        lastServerMsg ||
          "Could not sign in. Check school code, email/matric/staff ID, and password. Students: password is usually your matric number.",
      );
    } catch (err) {
      setError(friendlyLoginError(err));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-slate-50">
      <div className="mx-auto flex min-h-dvh max-w-6xl flex-col justify-center px-4 py-10 lg:flex-row lg:items-center lg:gap-16">
        <div className="mb-10 hidden flex-1 lg:block">
          <Logo size="lg" />
          <h1 className="mt-8 text-3xl font-extrabold tracking-tight text-slate-900">
            Examination platform for modern schools
          </h1>
          <p className="mt-3 max-w-md text-slate-600">
            Sign in with your school credentials to access exams, results, and administration tools.
          </p>
          <ul className="mt-8 space-y-4">
            {features.map((f) => (
              <li key={f.title} className="flex gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                  <f.icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-900">{f.title}</span>
                  <span className="text-sm text-slate-500">{f.desc}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-6 flex justify-center lg:hidden">
              <Logo size="md" />
            </div>
            <div className="text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-blue-600">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Welcome Back</h2>
              <p className="mt-1 text-sm text-slate-500">
                School users need a school code. Super admins leave it blank.
              </p>
            </div>

            {error ? (
              <Alert variant="destructive" className="mt-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="school-code">School code</Label>
                <Input
                  id="school-code"
                  ref={codeRef}
                  defaultValue=""
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  className="h-11"
                  placeholder="Leave blank if you are super admin"
                  autoComplete="organization"
                  disabled={loading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="identifier">Email / matric / staff ID</Label>
                <Input
                  id="identifier"
                  ref={identifierRef}
                  defaultValue=""
                  autoCorrect="off"
                  spellCheck={false}
                  className="h-11"
                  placeholder="Email or matric number"
                  autoComplete="username"
                  required
                  disabled={loading}
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
                    ref={passwordRef}
                    defaultValue=""
                    className="h-11 pr-10"
                    autoComplete="current-password"
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    disabled={loading}
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
                  disabled={loading}
                />
                <Label htmlFor="remember" className="text-sm font-normal text-slate-600">
                  Remember this device
                </Label>
              </div>
              <Button type="submit" className="h-11 w-full font-semibold" disabled={loading}>
                {loading ? (
                  <>
                    <img src="/logo.png" alt="" className="mr-2 h-5 w-5 object-contain opacity-90" />{" "}
                    Signing in…
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
              <Link to="/apply" className="font-semibold text-primary hover:underline">
                Apply here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
