import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Send, Save, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTeacherContext } from "@/lib/teacher";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/teacher/examinations")({
  validateSearch: (search: Record<string, unknown>) => ({
    course: typeof search.course === "string" ? search.course : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Examinations — D4EXAM" },
      {
        name: "description",
        content: "Create and schedule examinations for your assigned courses.",
      },
    ],
  }),
  component: Page,
});

type ExamRow = {
  id: string;
  title: string;
  status: string;
  duration_minutes: number;
  scheduled_start: string | null;
  scheduled_end: string | null;
  course_id: string | null;
  description: string | null;
  courses: { code: string; name: string } | null;
};

function Page() {
  const { course: courseFromUrl } = Route.useSearch();
  const { data: teacher, isLoading: tLoading } = useTeacherContext();
  const { data: session } = useSessionUser();
  const qc = useQueryClient();
  const [builder, setBuilder] = useState(false);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);

  const lockedCourseId =
    courseFromUrl && teacher?.courseIds.includes(courseFromUrl) ? courseFromUrl : null;
  const lockedCourse = teacher?.courses.find((c) => c.id === lockedCourseId) ?? null;

  const [courseId, setCourseId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(60);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");

  useEffect(() => {
    if (lockedCourseId) setCourseId(lockedCourseId);
  }, [lockedCourseId]);

  const listQ = useQuery({
    queryKey: ["teacher-exams", teacher?.schoolId, teacher?.courseIds, lockedCourseId],
    enabled: Boolean(teacher?.schoolId && teacher.courseIds.length),
    queryFn: async () => {
      if (!teacher) return [] as ExamRow[];
      let q = supabase
        .from("examinations")
        .select(
          "id, title, status, duration_minutes, scheduled_start, scheduled_end, course_id, description, courses(code, name)",
        )
        .eq("school_id", teacher.schoolId)
        .in("course_id", lockedCourseId ? [lockedCourseId] : teacher.courseIds)
        .order("created_at", { ascending: false })
        .limit(100);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ExamRow[];
    },
  });

  function openBuilder() {
    if (!teacher?.courses.length) {
      toast.error("No courses assigned");
      return;
    }
    setCourseId(lockedCourseId ?? teacher.courses[0].id);
    setTitle("");
    setDescription("");
    setDuration(60);
    setStartAt("");
    setEndAt("");
    setStep(1);
    setBuilder(true);
  }

  function validateStep(s: number) {
    if (s === 1) {
      if (!courseId || !teacher?.courseIds.includes(courseId)) {
        toast.error("Select an assigned course");
        return false;
      }
      if (lockedCourseId && courseId !== lockedCourseId) {
        toast.error("This view is locked to one course.");
        return false;
      }
      if (!title.trim()) {
        toast.error("Title is required");
        return false;
      }
      if (duration < 5) {
        toast.error("Duration must be at least 5 minutes");
        return false;
      }
    }
    if (s === 2 && startAt && endAt && new Date(endAt) <= new Date(startAt)) {
      toast.error("End must be after start");
      return false;
    }
    return true;
  }

  async function persist(status: "draft" | "pending_approval") {
    if (!teacher || !session || !validateStep(1)) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("examinations").insert({
        school_id: teacher.schoolId,
        course_id: courseId,
        created_by: session.userId,
        title: title.trim(),
        description: description.trim() || null,
        duration_minutes: duration,
        scheduled_start: startAt ? new Date(startAt).toISOString() : null,
        scheduled_end: endAt ? new Date(endAt).toISOString() : null,
        status,
      } as never);
      if (error) throw error;
      toast.success(
        status === "draft"
          ? "Draft saved"
          : "Submitted for Examination Officer approval",
      );
      setBuilder(false);
      await qc.invalidateQueries({ queryKey: ["teacher-exams"] });
      await listQ.refetch();
    } catch (err) {
      toast.error((err as Error).message || "Could not save examination");
    } finally {
      setBusy(false);
    }
  }

  async function submitExisting(id: string) {
    if (!teacher) return;
    try {
      const { error } = await supabase
        .from("examinations")
        .update({ status: "pending_approval" } as never)
        .eq("id", id)
        .eq("school_id", teacher.schoolId);
      if (error) throw error;
      toast.success("Submitted for officer approval");
      await listQ.refetch();
    } catch (err) {
      toast.error((err as Error).message || "Could not submit");
    }
  }

  if (tLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!teacher) {
    return (
      <EmptyState title="Teacher profile not found" description="Contact School Admin." />
    );
  }

  if (builder) {
    return (
      <>
        <PageHeader
          title="Create examination"
          description={
            lockedCourse
              ? `For ${lockedCourse.code} only. Submit for officer approval.`
              : "Only for courses assigned to you. Submit for officer approval."
          }
          actions={
            <Button variant="outline" onClick={() => setBuilder(false)}>
              Cancel
            </Button>
          }
        />

        <nav className="mb-6 flex flex-wrap gap-2">
          {[
            { id: 1, label: "Basic info" },
            { id: 2, label: "Schedule" },
            { id: 3, label: "Review & submit" },
          ].map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => s.id < step && setStep(s.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold",
                step === s.id
                  ? "border-primary bg-primary text-white"
                  : step > s.id
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-slate-200 bg-white text-slate-500",
              )}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <SectionCard>
          {step === 1 && (
            <div className="mx-auto max-w-xl space-y-4">
              <div className="space-y-2">
                <Label className="font-semibold">Assigned course</Label>
                {lockedCourse ? (
                  <p className="rounded-lg border bg-slate-50 px-3 py-2 text-sm font-semibold">
                    {lockedCourse.code} — {lockedCourse.name}
                  </p>
                ) : (
                  <Select value={courseId} onValueChange={setCourseId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select course" />
                    </SelectTrigger>
                    <SelectContent>
                      {teacher.courses.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.code} — {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Title</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. First Semester Examination"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Instructions</Label>
                <Textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Instructions for candidates…"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Duration (minutes)</Label>
                <Input
                  type="number"
                  min={5}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value) || 60)}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="mx-auto max-w-xl space-y-4">
              <p className="text-sm text-slate-600">
                Proposed schedule. Examination Officer may adjust on approval.
              </p>
              <div className="space-y-2">
                <Label className="font-semibold">Start</Label>
                <Input
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">End</Label>
                <Input
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="mx-auto max-w-xl space-y-3 text-sm">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-extrabold text-slate-900">{title || "Untitled"}</p>
                <dl className="mt-3 space-y-2 text-slate-600">
                  <div className="flex justify-between gap-4">
                    <dt>Course</dt>
                    <dd className="font-semibold text-slate-900">
                      {teacher.courses.find((c) => c.id === courseId)?.code ?? "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Duration</dt>
                    <dd className="font-semibold text-slate-900">{duration} min</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Start</dt>
                    <dd className="font-semibold text-slate-900">
                      {startAt ? new Date(startAt).toLocaleString() : "Not set"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>End</dt>
                    <dd className="font-semibold text-slate-900">
                      {endAt ? new Date(endAt).toLocaleString() : "Not set"}
                    </dd>
                  </div>
                </dl>
              </div>
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Submitting sends this exam to the Examination Officer. Students only see it after
                approval.
              </p>
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <Button variant="outline" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void persist("draft")}
              >
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                Save draft
              </Button>
              {step < 3 ? (
                <Button
                  className="font-semibold"
                  onClick={() => {
                    if (validateStep(step)) setStep((s) => s + 1);
                  }}
                >
                  Continue
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  className="font-semibold"
                  disabled={busy}
                  onClick={() => void persist("pending_approval")}
                >
                  {busy ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-1.5 h-4 w-4" />
                  )}
                  Submit for approval
                </Button>
              )}
            </div>
          </div>
        </SectionCard>
      </>
    );
  }

  const exams = listQ.data ?? [];

  return (
    <>
      <PageHeader
        title={lockedCourse ? `Exams · ${lockedCourse.code}` : "Examinations"}
        description={
          lockedCourse
            ? `Only exams for ${lockedCourse.code} — ${lockedCourse.name}`
            : `Create exams for your assigned courses · ${teacher.fullName}`
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {lockedCourse && (
              <Button variant="outline" className="font-semibold" asChild>
                <Link to="/teacher/courses">All courses</Link>
              </Button>
            )}
            <Button
              className="font-semibold"
              onClick={openBuilder}
              disabled={!teacher.courses.length}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Create examination
            </Button>
          </div>
        }
      />

      {!teacher.courses.length ? (
        <EmptyState
          title="No courses assigned"
          description="School Admin must assign courses before you can create examinations."
        />
      ) : (
        <SectionCard
          title={lockedCourse ? `${lockedCourse.code} examinations` : "Your examinations (live)"}
        >
          {listQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : exams.length === 0 ? (
            <EmptyState
              title={lockedCourse ? `No exams for ${lockedCourse.code}` : "No examinations yet"}
              description="Create one for this course."
              actionLabel="Create examination"
              onAction={openBuilder}
            />
          ) : (
            <ul className="space-y-3">
              {exams.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{e.title}</p>
                    <p className="text-xs text-slate-500">
                      {e.courses?.code ?? "—"} · {e.duration_minutes} min ·{" "}
                      {e.scheduled_start
                        ? new Date(e.scheduled_start).toLocaleString()
                        : "Not scheduled"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={String(e.status).replaceAll("_", " ")} />
                    {e.status === "draft" && (
                      <Button
                        size="sm"
                        className="font-semibold"
                        onClick={() => void submitExisting(e.id)}
                      >
                        Submit
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}
    </>
  );
}
