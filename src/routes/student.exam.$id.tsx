import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Flag,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ShieldCheck,
  Camera,
  Wifi,
  Monitor,
  AlertTriangle,
  Eraser,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useStudentContext, canStartExam } from "@/lib/student";
import {
  fromExamSettingsRow,
  parseSecurityFromDescription,
  type ExamSettingsRow,
} from "@/lib/exam-security";
import { parseExamMeta, pickExamQuestions, seededShuffle } from "@/lib/exam-meta";
import { logSecurityEvent, scoreObjectiveAnswers } from "@/lib/cbt-security";
import { toast } from "sonner";

export const Route = createFileRoute("/student/exam/$id")({
  head: () => ({
    meta: [
      { title: "CBT Examination — D4EXAM" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CbtExamPage,
});

// TEMPORARY STUB — full file restore in progress
function CbtExamPage() {
  return (
    <div className="grid min-h-dvh place-items-center bg-slate-50 p-6 text-center">
      <div className="max-w-md space-y-3">
        <Logo size="sm" className="mx-auto" />
        <h1 className="text-xl font-extrabold text-slate-900">Exam page restoring</h1>
        <p className="text-sm text-slate-600">
          The CBT examination screen is being restored. Please reopen this page in a minute, or
          restore <code>src/routes/student.exam.$id.tsx</code> from git history commit
          20777d7.
        </p>
        <Button asChild>
          <Link to="/student/examinations">Back to examinations</Link>
        </Button>
      </div>
    </div>
  );
}
