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
