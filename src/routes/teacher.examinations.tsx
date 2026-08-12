import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Send,
  Save,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Undo2,
  Pencil,
  Trash2,
} from "lucide-react";
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
import {
  embedSecurityInDescription,
  loadTeacherSecurityDefaults,
  parseSecurityFromDescription,
  securitySummaryLines,
  stripSecurityMarker,
  toExamSettingsRow,
} from "@/lib/exam-security";
import { embedExamMeta, parseExamMeta } from "@/lib/exam-meta";
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
  created_by: string | null;
  courses: { code: string; name: string } | null;
};

function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function endFromStart(startLocal: string, durationMin: number) {
  if (!startLocal) return "";
  const d = new Date(startLocal);
  if (Number.isNaN(d.getTime())) return "";
  d.setMinutes(d.getMinutes() + Math.max(1, durationMin));
  return toLocalInput(d.toISOString());
}

async function tryUpsertExamSettings(examId: string, teacherId: string) {
  const security = loadTeacherSecurityDefaults(teacherId);
  try {
    const row = toExamSettingsRow(examId, security, 0);
    const { error } = await supabase.from("exam_settings").upsert(row as never, {
      onConflict: "exam_id",
    });
    if (error) {
      console.warn("exam_settings upsert skipped:", error.message);
      return { security, savedToTable: false, error: error.message };
    }
    return { security, savedToTable: true as const, error: null };
  } catch (e) {
    console.warn("exam_settings upsert failed", e);
    return { security, savedToTable: false, error: (e as Error).message };
  }
}

function Page() {
  const { course: courseFromUrl } = Route.useSearch();
  const { data: teacher, isLoading: tLoading } = useTeacherContext();
  const { data: session } = useSessionUser();
  const qc = useQueryClient();
  const [builder, setBuilder] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);

  const lockedCourseId =
    courseFromUrl && teacher?.courseIds.includes(courseFromUrl) ? courseFromUrl : null;
  const lockedCourse = teacher?.courses.find((c) => c.id === lockedCourseId) ?? null;

  const [courseId, setCourseId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [durationText, setDurationText] = useState("60");
  const [questionsText, setQuestionsText] = useState("20");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");

  const durationMinutes = Math.max(1, Number.parseInt(durationText, 10) || 0);
  const questionsToAnswer = Math.max(1, Number.parseInt(questionsText, 10) || 0);

  useEffect(() => {
    if (lockedCourseId) setCourseId(lockedCourseId);
  }, [lockedCourseId]);

  const bankCountQ = useQuery({
    queryKey: ["teacher-bank-count", teacher?.schoolId, courseId],
    enabled: Boolean(teacher?.schoolId && courseId),
    queryFn: async () => {
      if (!teacher || !courseId) return 0;
      const { count, error } = await supabase
        .from("questions")
        .select("*", { count: "exact", head: true })
        .eq("school_id", teacher.schoolId)
        .eq("course_id", courseId)
        .eq("status", "active");
      if (error) return 0;
      return count ?? 0;
    },
  });
  const bankCount = bankCountQ.data ?? 0;

  const listQ = useQuery({
    queryKey: ["teacher-exams", teacher?.schoolId, teacher?.courseIds, lockedCourseId, session?.userId],
    enabled: Boolean(teacher?.schoolId && teacher.courseIds.length),
    refetchInterval: 20_000,
    queryFn: async () => {
      if (!teacher || !session) return [] as ExamRow[];
      const { data, error } = await supabase
        .from("examinations")
        .select(
          "id, title, status, duration_minutes, scheduled_start, scheduled_end, course_id, description, created_by, courses(code, name)",
        )
        .eq("school_id", teacher.schoolId)
        .in("course_id", lockedCourseId ? [lockedCourseId] : teacher.courseIds)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      // Teacher sees own drafts; everyone else's drafts are hidden from this list too for clarity
      return ((data ?? []) as ExamRow[]).filter((e) => {
        if (e.status === "draft") return e.created_by === session.userId;
        return true;
      });
    },
  });

  const securityPreview = teacher ? loadTeacherSecurityDefaults(teacher.teacherId) : null;

  function resetForm() {
    setCourseId(lockedCourseId ?? teacher?.courses[0]?.id ?? "");
    setTitle("");
    setDescription("");
    setDurationText("60");
    setQuestionsText("20");
    setStartAt("");
    setEndAt("");
    setStep(1);
    setEditingId(null);
  }

  function openBuilder() {
    if (!teacher?.courses.length) {
      toast.error("No courses assigned");
      return;
    }
    resetForm();
    setCourseId(lockedCourseId ?? teacher.courses[0].id);
    setBuilder(true);
  }

  function openEdit(e: ExamRow) {
    if (e.status !== "draft" && e.status !== "changes_requested") {
      toast.error("Only draft or changes-requested exams can be edited");
      return;
    }
    const plain = stripSecurityMarker(e.description);
    const meta = parseExamMeta(e.description);
    // strip meta line from visible instructions
    const instructions = plain
      .split("\n")
      .filter((l) => !l.startsWith("[[D4_EXAM_META]]"))
      .join("\n")
      .trim();
    setEditingId(e.id);
    setCourseId(e.course_id ?? "");
    setTitle(e.title);
    setDescription(instructions);
    setDurationText(String(e.duration_minutes || 60));
    setQuestionsText(String(meta.questionsToAnswer ?? 20));
    setStartAt(toLocalInput(e.scheduled_start));
    setEndAt(toLocalInput(e.scheduled_end));
    setStep(1);
    setBuilder(true);
  }

  function onStartChange(v: string) {
    setStartAt(v);
    if (v) setEndAt(endFromStart(v, durationMinutes || 60));
  }

  function onDurationTextChange(raw: string) {
    if (raw === "" || /^\d+$/.test(raw)) {
      setDurationText(raw);
      const n = Number.parseInt(raw, 10);
      if (startAt && n >= 1) setEndAt(endFromStart(startAt, n));
    }
  }

  function onQuestionsTextChange(raw: string) {
    if (raw === "" || /^\d+$/.test(raw)) setQuestionsText(raw);
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
      if (!durationText || durationMinutes < 5) {
        toast.error("Duration must be at least 5 minutes");
        return false;
      }
      if (!questionsText || questionsToAnswer < 1) {
        toast.error("Questions to answer must be at least 1");
        return false;
      }
      if (bankCount > 0 && questionsToAnswer > bankCount) {
        toast.error(`Bank has only ${bankCount} active questions. Lower “questions to answer”.`);
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
      const security = loadTeacherSecurityDefaults(teacher.teacherId);
      let desc = description.trim() || null;
      desc = embedExamMeta(desc, { questionsToAnswer });
      desc = embedSecurityInDescription(desc, security);

      const computedEnd =
        endAt || (startAt ? endFromStart(startAt, durationMinutes) : "");

      const payload = {
        school_id: teacher.schoolId,
        course_id: courseId,
        created_by: session.userId,
        title: title.trim(),
        description: desc,
        duration_minutes: durationMinutes,
        scheduled_start: startAt ? new Date(startAt).toISOString() : null,
        scheduled_end: computedEnd ? new Date(computedEnd).toISOString() : null,
        status,
      };

      let examId = editingId;

      if (editingId) {
        const { error } = await supabase
          .from("examinations")
          .update(payload as never)
          .eq("id", editingId)
          .eq("school_id", teacher.schoolId)
          .eq("created_by", session.userId);
        if (error) throw error;
      } else {
        const { data: created, error } = await supabase
          .from("examinations")
          .insert(payload as never)
          .select("id")
          .single();
        if (error) throw error;
        if (!created?.id) throw new Error("Examination was not created");
        examId = created.id as string;
      }

      if (examId) await tryUpsertExamSettings(examId, teacher.teacherId);

      toast.success(
        status === "draft"
          ? editingId
            ? "Draft updated"
            : "Draft saved"
          : "Submitted for Examination Officer approval",
      );
      setBuilder(false);
      setEditingId(null);
      await qc.invalidateQueries({ queryKey: ["teacher-exams"] });
      await listQ.refetch();
    } catch (err) {
      toast.error((err as Error).message || "Could not save examination");
    } finally {
      setBusy(false);
    }
  }

  async function submitExisting(id: string) {
    if (!teacher || !session) return;
    try {
      const security = loadTeacherSecurityDefaults(teacher.teacherId);
      const { data: existing } = await supabase
        .from("examinations")
        .select("description")
        .eq("id", id)
        .maybeSingle();
      let desc = (existing as { description?: string } | null)?.description ?? null;
      const meta = parseExamMeta(desc);
      desc = embedExamMeta(desc, meta);
      desc = embedSecurityInDescription(desc, security);
      const { error } = await supabase
        .from("examinations")
        .update({ status: "pending_approval", description: desc } as never)
        .eq("id", id)
        .eq("school_id", teacher.schoolId)
        .eq("created_by", session.userId);
      if (error) throw error;
      await tryUpsertExamSettings(id, teacher.teacherId);
      toast.success("Submitted for officer approval");
      await listQ.refetch();
    } catch (err) {
      toast.error((err as Error).message || "Could not submit");
    }
  }

  async function cancelSubmit(id: string) {
    if (!teacher || !session) return;
    if (!confirm("Withdraw this examination from officer review? It will return to draft.")) return;
    try {
      const { error } = await supabase
        .from("examinations")
        .update({ status: "draft" } as never)
        .eq("id", id)
        .eq("school_id", teacher.schoolId)
        .eq("created_by", session.userId)
        .in("status", ["pending_approval", "changes_requested"]);
      if (error) throw error;
      toast.success("Submission cancelled — exam is draft again");
      await listQ.refetch();
    } catch (err) {
      toast.error((err as Error).message || "Could not cancel submission");
    }
  }

  async function deleteExam(id: string) {
    if (!teacher || !session) return;
    if (!confirm("Delete this draft permanently? This cannot be undone.")) return;
    try {
      const { error } = await supabase
        .from("examinations")
        .delete()
        .eq("id", id)
        .eq("school_id", teacher.schoolId)
        .eq("created_by", session.userId)
        .in("status", ["draft", "changes_requested", "rejected"]);
      if (error) throw error;
      toast.success("Examination deleted");
      await listQ.refetch();
    } catch (err) {
      toast.error((err as Error).message || "Could not delete");
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
          title={editingId ? "Edit examination" : "Create examination"}
          description={
            lockedCourse
              ? `For ${lockedCourse.code} only. Save draft or submit for officer approval.`
              : "Only for courses assigned to you. Save draft or submit for officer approval."
          }
          actions={
            <Button
              variant="outline"
              onClick={() => {
                setBuilder(false);
                setEditingId(null);
              }}
            >
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
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="font-semibold">Duration (minutes)</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={durationText}
                    onChange={(e) => onDurationTextChange(e.target.value)}
                    placeholder="e.g. 20"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-semibold">Questions to answer</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={questionsText}
                    onChange={(e) => onQuestionsTextChange(e.target.value)}
                    placeholder="e.g. 20"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Course bank has <strong>{bankCount}</strong> active question(s). Students answer{" "}
                <strong>{questionsText || "?"}</strong>
                {securityPreview?.randomizeQuestions
                  ? " — each student gets a random mix (shown as 1, 2, 3…)."
                  : " — taken in bank order unless randomise is on in Exam Security."}
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="mx-auto max-w-xl space-y-4">
              <p className="text-sm text-slate-600">
                Set date and time (hour and minutes). End auto-fills from start + duration.
              </p>
              <div className="space-y-2">
                <Label className="font-semibold">Start (date & time)</Label>
                <Input
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => onStartChange(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">End (date & time)</Label>
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
                    <dd className="font-semibold text-slate-900">{durationMinutes} min</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Questions to answer</dt>
                    <dd className="font-semibold text-slate-900">
                      {questionsToAnswer} of {bankCount} in bank
                    </dd>
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

              {securityPreview && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <p className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Exam security (from your defaults)
                  </p>
                  <ul className="space-y-1 text-xs text-slate-700">
                    {securitySummaryLines(securityPreview).map((line) => (
                      <li key={line}>• {line}</li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Drafts stay private to you. Students only see the exam after the Examination Officer
                approves it. While pending, you can cancel the submission and return it to draft.
              </p>
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <Button variant="outline" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy} onClick={() => void persist("draft")}>
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
              {exams.map((e) => {
                const approvedLike = ["approved", "scheduled", "published", "ongoing"].includes(
                  e.status,
                );
                const meta = parseExamMeta(e.description);
                const canEdit = e.status === "draft" || e.status === "changes_requested";
                const canDelete = ["draft", "changes_requested", "rejected"].includes(e.status);
                return (
                  <li
                    key={e.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{e.title}</p>
                      <p className="text-xs text-slate-500">
                        {e.courses?.code ?? "—"} · {e.duration_minutes} min
                        {meta.questionsToAnswer ? ` · ${meta.questionsToAnswer} questions` : ""}
                        {e.scheduled_start
                          ? ` · Starts ${new Date(e.scheduled_start).toLocaleString()}`
                          : " · Not scheduled"}
                      </p>
                      {approvedLike && (
                        <p className="mt-1 text-xs font-semibold text-primary">
                          Approved
                          {e.scheduled_start
                            ? ` — exam starting ${new Date(e.scheduled_start).toLocaleString()}`
                            : " — schedule may still be set by officer"}
                        </p>
                      )}
                      {e.status === "pending_approval" && (
                        <p className="mt-1 text-xs text-amber-700">Waiting for officer approval</p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={String(e.status).replaceAll("_", " ")} />
                      {canEdit && (
                        <Button size="sm" variant="outline" className="font-semibold" onClick={() => openEdit(e)}>
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          Edit
                        </Button>
                      )}
                      {e.status === "draft" && (
                        <Button size="sm" className="font-semibold" onClick={() => void submitExisting(e.id)}>
                          Submit
                        </Button>
                      )}
                      {(e.status === "pending_approval" || e.status === "changes_requested") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="font-semibold"
                          onClick={() => void cancelSubmit(e.id)}
                        >
                          <Undo2 className="mr-1 h-3.5 w-3.5" />
                          Cancel submit
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="font-semibold text-red-600 hover:bg-red-50"
                          onClick={() => void deleteExam(e.id)}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      )}
    </>
  );
}
