import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, ShieldCheck, Loader2 } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Login — D4EXAM" },
      {
        name: "description",
        content:
          "Sign in to your institution's D4EXAM account with your school code and credentials.",
      },
      { property: "og:title", content: "Login — D4EXAM" },
      { property: "og:description", content: "Secure sign-in for students, staff and administrators." },
    ],
  }),
  component: LoginPage,
});

// Phase 1: mock destination selector only. Role detection happens server-side in Phase 2.
const destinations = [
  { value: "/student", label: "Student portal" },
  { value: "/teacher", label: "Teacher portal" },
  { value: "/admin", label: "School admin portal" },
  { value: "/officer", label: "Examination officer portal" },
  { value: "/super-admin", label: "Super admin portal" },
];

function LoginPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dest, setDest] = useState("/student");
  const [code, setCode] = useState("ESU");
  const [identifier, setIdentifier] = useState("CSC/2021/0184");
  const [password, setPassword] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!code.trim() || !identifier.trim() || !password.trim()) {
      setError("Enter your school code, username and password to continue.");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      navigate({ to: dest });
    }, 900);
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-4 py-8 sm:px-8">
        <Link to="/" aria-label="D4EXAM home" className="self-start">
          <Logo size="md" />
        </Link>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <h1 className="text-2xl font-bold sm:text-3xl">Welcome back</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to continue to your institution's examination portal.
          </p>

          {error && (
            <Alert variant="destructive" className="mt-6">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
            <div className="space-y-2">
              <Label htmlFor="school-code">School / Institution Code</Label>
              <Input
                id="school-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter school code"
                autoComplete="organization"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="identifier">Student ID / Matric Number / Staff ID / Email</Label>
              <Input
                id="identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Enter your ID or email"
                autoComplete="username"
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
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox id="remember" defaultChecked />
                <span>Remember me</span>
              </label>
              <Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">
                Forgot password?
              </Link>
            </div>

            <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
              <Label htmlFor="dest" className="text-xs text-muted-foreground">
                Phase 1 preview destination (role detection is automatic in production)
              </Label>
              <Select value={dest} onValueChange={setDest}>
                <SelectTrigger id="dest">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {destinations.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              {loading ? "Signing in…" : "Login"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Need help?{" "}
            <Link to="/support" className="font-medium text-primary hover:underline">
              Contact Support
            </Link>
          </p>
        </div>
      </div>

      <aside className="hidden flex-col items-center justify-center border-l border-border bg-surface px-10 lg:flex">
        <ShieldCheck className="h-14 w-14 text-primary" aria-hidden />
        <h2 className="mt-6 text-2xl font-bold">Secure. Reliable. Trusted.</h2>
        <p className="mt-3 max-w-sm text-center text-muted-foreground">
          D4EXAM ensures a secure and fair examination experience for every candidate, in every
          institution, on every device.
        </p>
        <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
          {[
            "Encrypted credentials and session isolation",
            "Full integrity audit trail on every attempt",
            "Officer approval before results are published",
          ].map((i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              {i}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
