import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set Password — D4EXAM" },
      {
        name: "description",
        content: "Choose a password for your D4EXAM account after invite or password recovery.",
      },
    ],
  }),
  component: ResetPasswordPage,
});

const rules = [
  { label: "At least 8 characters", test: (v: string) => v.length >= 8 },
  { label: "One uppercase letter", test: (v: string) => /[A-Z]/.test(v) },
  { label: "One number", test: (v: string) => /\d/.test(v) },
  { label: "One special character", test: (v: string) => /[^A-Za-z0-9]/.test(v) },
];

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const mismatch = confirm.length > 0 && confirm !== password;
  const valid = rules.every((r) => r.test(password)) && !mismatch && confirm.length > 0;

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setChecking(true);
      setError("");
      try {
        // PKCE invite/recovery: ?code=...
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          const code = url.searchParams.get("code");
          if (code) {
            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError) {
              if (!cancelled) {
                setError(exchangeError.message || "Invite link is invalid or expired.");
                setChecking(false);
              }
              return;
            }
            // Clean sensitive params from the address bar
            window.history.replaceState({}, document.title, "/reset-password");
          }
        }

        const { data } = await supabase.auth.getSession();
        if (!cancelled) {
          if (data.session) {
            setReady(true);
          } else {
            setError(
              "No active invite or recovery session. Open the link from your email again, or ask an admin to resend the invite.",
            );
          }
          setChecking(false);
        }
      } catch {
        if (!cancelled) {
          setError("Could not validate the invite link. Try the email link again.");
          setChecking(false);
        }
      }
    }

    void bootstrap();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        if (session) {
          setReady(true);
          setError("");
          setChecking(false);
        }
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError("");
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message || "Could not update password.");
        return;
      }

      // Mark profile active if it was invited
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        await supabase
          .from("profiles")
          .update({ status: "active" })
          .eq("auth_user_id", userData.user.id)
          .in("status", ["invited", "pending"]);
      }

      setDone(true);
    } catch {
      setError("Could not update password. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-white px-4 py-8 sm:px-8">
      <Link to="/" aria-label="D4EXAM home" className="self-start">
        <Logo size="md" />
      </Link>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-extrabold text-slate-900">Set your password</h1>
          <p className="mt-2 text-sm text-slate-600">
            Use this page after the invite or reset email. Choose a strong password, then sign in with
            your school code and email.
          </p>

          {checking && (
            <p className="mt-6 flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking invite link…
            </p>
          )}

          {error && !done && (
            <Alert variant="destructive" className="mt-6">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {done ? (
            <>
              <Alert className="mt-6 border-primary/30 bg-primary/10">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <AlertTitle>Password saved</AlertTitle>
                <AlertDescription>
                  You can now sign in on the login page with your school code, email, and this
                  password.
                </AlertDescription>
              </Alert>
              <Button className="mt-6 w-full font-semibold" asChild>
                <Link to="/login">Continue to login</Link>
              </Button>
            </>
          ) : (
            !checking &&
            ready && (
              <form className="mt-6 space-y-4" onSubmit={onSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirm password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    aria-invalid={mismatch}
                  />
                  {mismatch && (
                    <p className="text-xs text-destructive">Passwords do not match.</p>
                  )}
                </div>

                <ul className="space-y-1.5 rounded-lg border border-slate-200 p-3">
                  {rules.map((r) => {
                    const ok = r.test(password);
                    return (
                      <li
                        key={r.label}
                        className={`flex items-center gap-2 text-xs ${ok ? "text-primary" : "text-slate-500"}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-primary" : "bg-slate-300"}`}
                        />
                        {r.label}
                      </li>
                    );
                  })}
                </ul>

                <Button type="submit" className="w-full font-semibold" disabled={!valid || saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save password
                </Button>
              </form>
            )
          )}

          {!checking && !ready && !done && (
            <Button className="mt-6 w-full" variant="outline" asChild>
              <Link to="/login">Back to login</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
