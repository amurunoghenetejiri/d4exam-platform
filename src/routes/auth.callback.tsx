import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [{ title: "Signing in — D4EXAM" }],
  }),
  component: AuthCallbackPage,
});

/**
 * Handles invite / magic-link / recovery redirects that land with ?code=
 * then sends the user to set password or home.
 */
function AuthCallbackPage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Finishing sign-in…");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const next = url.searchParams.get("next") || "/reset-password";

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            if (!cancelled) setMessage(error.message || "Link invalid or expired.");
            return;
          }
        } else {
          const { data } = await supabase.auth.getSession();
          if (!data.session) {
            if (!cancelled) setMessage("No session found. Open the link from your email again.");
            return;
          }
        }

        if (!cancelled) {
          navigate({ to: next as never });
        }
      } catch {
        if (!cancelled) setMessage("Could not complete sign-in from this link.");
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-white px-4">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-sm text-slate-600">{message}</p>
    </div>
  );
}
