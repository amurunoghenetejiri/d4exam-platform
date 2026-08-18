import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/lib/session";
import { isSyntheticStudentEmail } from "@/lib/student-email";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Minimal banner: shown when the student still has a system/synthetic email.
 * Does not change shell layout — only a small card above page content.
 */
export function StudentEmailCapture() {
  const { data: session } = useSessionUser();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [skipped, setSkipped] = useState(false);

  if (!session || session.role !== "student") return null;
  if (done || skipped) return null;
  if (!isSyntheticStudentEmail(session.email)) return null;

  async function save() {
    setError("");
    const value = email.trim().toLowerCase();
    if (!/^[\^\s@]+@[\^\s@]+\.[\^\s@]+$/.test(value)) {
      setError("Enter a valid email address.");
      return;
    }
    setSaving(true);
    try {
      const updates: PromiseLike<unknown>[] = [];
      if (session!.profileId) {
        updates.push(
          supabase
            .from("profiles")
            .update({ email: value } as never)
            .eq("id", session!.profileId),
        );
      }
      updates.push(
        supabase
          .from("profiles")
          .update({ email: value } as never)
          .eq("auth_user_id", session!.userId),
      );
      updates.push(
        supabase
          .from("students")
          .update({ email: value } as never)
          .eq("profile_id", session!.profileId),
      );
      await Promise.all(updates);
      setDone(true);
      void qc.invalidateQueries({ queryKey: ["session-user"] });
    } catch (e) {
      setError((e as Error).message || "Could not save email.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-900">Add your email</p>
      <p className="mt-1 text-xs text-slate-500">
        Optional but recommended. Used for results and account recovery. You can change it later.
      </p>
      <div className="mt-3 space-y-2">
        <Label htmlFor="student-personal-email" className="text-xs font-semibold">
          Email
        </Label>
        <Input
          id="student-personal-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@gmail.com"
          className="h-10"
          autoComplete="email"
        />
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="button" size="sm" className="font-semibold" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save email"}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => setSkipped(true)}>
            Skip for now
          </Button>
        </div>
      </div>
    </div>
  );
}
