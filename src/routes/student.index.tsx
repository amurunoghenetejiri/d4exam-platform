import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  ClipboardList,
  Award,
  Bell,
  ChevronRight,
  Loader2,
  WifiOff,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { friendlyError } from "@/lib/errors";
import {
  useStudentContext,
  STUDENT_VISIBLE_EXAM_STATUSES,
  examAvailability,
  isExamAttemptFinished,
} from "@/lib/student";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { processDueExamReminders } from "@/lib/notify";
import { toast } from "sonner";

export const Route = createFileRoute("/student/")({
  component: Page,
});

// PLACEHOLDER_WILL_REPLACE_WITH_FULL - this is incomplete intentionally for size test
