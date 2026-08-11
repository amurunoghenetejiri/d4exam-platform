import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MailCheck } from "lucide-react";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Forgot Password — D4EXAM" },
      {
        name: "description",
        content: "Request a secure password reset link for your D4EXAM examination account.",
      },
      { property: "og:title", content: "Forgot Password — D4EXAM" },
      { property: "og:description", content: "Recover access to your D4EXAM account." },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col px-4 py-8 sm:px-8">
      <Link to="/" aria-label="D4EXAM home" className="self-start">
        <Logo size="md" />
      </Link>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="surface-panel p-6 sm:p-8">
          <h1 className="text-2xl font-bold">Forgot your password?</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your school code and account email. We'll send a secure reset link that expires in
            30 minutes.
          </p>

          {sent ? (
            <Alert className="mt-6 border-primary/30 bg-primary/10">
              <MailCheck className="h-4 w-4 text-primary" />
              <AlertTitle>Reset link sent</AlertTitle>
              <AlertDescription>
                Check your inbox for instructions. Didn't get it? Check spam or contact your school
                administrator.
              </AlertDescription>
            </Alert>
          ) : (
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setLoading(true);
                setTimeout(() => {
                  setLoading(false);
                  setSent(true);
                }, 800);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="code">School / Institution Code</Label>
                <Input id="code" placeholder="Enter school code" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input id="email" type="email" placeholder="you@school.edu" required />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          )}

          <div className="mt-6 flex items-center justify-between text-sm">
            <Link to="/login" className="font-medium text-primary hover:underline">
              Back to login
            </Link>
            <Link to="/support" className="text-muted-foreground hover:text-foreground">
              Contact support
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
