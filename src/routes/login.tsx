import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { signInWithSchoolCode } from "@/lib/auth.functions";
import { fetchSessionUser, roleHome } from "@/lib/session";

import { Eye, EyeOff, ShieldCheck, Loader2, Building2 } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const Route = createFileRoute("/login")({
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
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const signIn = useServerFn(signInWithSchoolCode);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!code.trim() || !identifier.trim() || !password.trim()) {
      setError("Enter your school code, username and password to continue.");
      return;
    }
    setLoading(true);
    try {
      const result = await signIn({
        data: { schoolCode: code.trim(), identifier: identifier.trim(), password },
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
    <div className="grid min-h-dvh bg-white lg:grid-cols-2">
      <div className="flex flex-col px-4 py-8 sm:px-8">
        <Link to="/" aria-label="D4EXAM home" className="self-start">
          <Logo size="lg" />
        </Link>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            {/* Institution mark */}
            <div className="mb-6 flex flex-col items-center text-center">
              <div className="grid h-16 w-16 place-items-center rounded-2xl border border-slate-200 bg-slate-50 text-primary shadow-sm">
                <Building2 className="h-8 w-8" aria-hidden />
              </div>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Institutional sign-in
              </p>
            </div>

            <h1 className="text-center text-2xl font-extrabold text-slate-900 sm:text-3xl">
              Welcome Back!
            </h1>
            <p className="mt-2 text-center text-sm text-slate-600">Sign in to continue</p>

            {error && (
              <Alert variant="destructive" className="mt-5">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
              <div className="space-y-2">
                <Label htmlFor="school-code" className="font-semibold text-slate-700">
                  School Code
                </Label>
                <Input
                  id="school-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. your school code"
                  className="h-11 rounded-lg border-slate-200 bg-white"
                  autoComplete="organization"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="identifier" className="font-semibold text-slate-700">
                  Username / Matric / Staff ID / Email
                </Label>
                <Input
                  id="identifier"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Enter username, matric number, staff ID or email"
                  className="h-11 rounded-lg border-slate-200 bg-white"
                  autoComplete="username"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="font-semibold text-slate-700">
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
                    className="h-11 rounded-lg border-slate-200 bg-white pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-slate-500 hover:text-slate-800"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <Checkbox id="remember" />
                  <span>Remember me</span>
                </label>
                <Link
                  to="/forgot-password"
                  className="text-sm font-semibold text-primary hover:underline"
                >
                  Forgot Password?
                </Link>
              </div>

              <Button
                type="submit"
                className="h-11 w-full rounded-lg text-base font-semibold"
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                {loading ? "Signing in…" : "Login"}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-600">
              Need Help?{" "}
              <Link to="/support" className="font-semibold text-primary hover:underline">
                Contact Support
              </Link>
            </p>
          </div>
        </div>
      </div>

      <aside className="hidden flex-col items-center justify-center border-l border-slate-200 bg-slate-50 px-10 lg:flex">
        <div className="grid h-20 w-20 place-items-center rounded-full bg-blue-50 text-primary">
          <ShieldCheck className="h-10 w-10" aria-hidden />
        </div>
        <h2 className="mt-6 text-2xl font-extrabold text-slate-900">Secure. Reliable. Trusted.</h2>
        <p className="mt-3 max-w-sm text-center text-slate-600">
          D4EXAM ensures a secure and fair examination experience for everyone.
        </p>
      </aside>
    </div>
  );
}
