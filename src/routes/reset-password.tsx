import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset Password — D4EXAM" },
      {
        name: "description",
        content: "Choose a new password for your D4EXAM examination account.",
      },
      { property: "og:title", content: "Reset Password — D4EXAM" },
      { property: "og:description", content: "Set a new password and regain access." },
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
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const mismatch = confirm.length > 0 && confirm !== password;
  const valid = rules.every((r) => r.test(password)) && !mismatch && confirm.length > 0;

  return (
    <div className="flex min-h-dvh flex-col px-4 py-8 sm:px-8">
      <Link to="/" aria-label="D4EXAM home" className="self-start">
        <Logo size="md" />
      </Link>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="surface-panel p-6 sm:p-8">
          <h1 className="text-2xl font-bold">Set a new password</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your new password must be different from previously used passwords.
          </p>

          {done ? (
            <>
              <Alert className="mt-6 border-primary/30 bg-primary/10">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <AlertTitle>Password updated</AlertTitle>
                <AlertDescription>You can now sign in with your new password.</AlertDescription>
              </Alert>
              <Button className="mt-6 w-full" asChild>
                <Link to="/login">Continue to login</Link>
              </Button>
            </>
          ) : (
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setDone(true);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  aria-invalid={mismatch}
                />
                {mismatch && (
                  <p className="text-xs text-destructive">Passwords do not match.</p>
                )}
              </div>

              <ul className="space-y-1.5 rounded-lg border border-border p-3">
                {rules.map((r) => {
                  const ok = r.test(password);
                  return (
                    <li
                      key={r.label}
                      className={`flex items-center gap-2 text-xs ${ok ? "text-primary" : "text-muted-foreground"}`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-primary" : "bg-muted-foreground"}`}
                      />
                      {r.label}
                    </li>
                  );
                })}
              </ul>

              <Button type="submit" className="w-full" disabled={!valid}>
                Update password
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
