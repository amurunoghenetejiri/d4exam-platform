import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Send,
  Save,
  ShieldCheck,
  ListChecks,
  CalendarDays,
  Eye,
  FileText,
} from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as mock from "@/data/mock";
import type { Exam, Question } from "@/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/teacher/examinations")({
  head: () => ({
    meta: [
      { title: "Examinations — D4EXAM" },
      {
        name: "description",
        content: "Create examinations for your assigned courses and submit them for officer approval.",
      },
    ],
  }),
  component: Page,
});

const STEPS = [
  { id: 1, label: "Basic info", icon: FileText },
  { id: 2, label: "Questions", icon: ListChecks },
  { id: 3, label: "Schedule", icon: CalendarDays },
  { id: 4, label: "Security", icon: ShieldCheck },
  { id: 5, label: "Preview", icon: Eye },
] as const;

const ASSIGNED = mock.currentTeacher.assignedCourses;

function Page() {
  const [exams, setExams] = useState<Exam[]>(() => [...mock.teacherExams]);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [step, setStep] = useState(1);

  // Builder state
  const [courseCode, setCourseCode] = useState(ASSIGNED[0] ?? "");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [duration, setDuration] = useState(60);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [fullscreen, setFullscreen] = useState(true);
  const [tabMonitoring, setTabMonitoring] = useState(true);
  const [maxTabSwitches, setMaxTabSwitches] = useState(5);
  const [blockCopyPaste, setBlockCopyPaste] = useState(true);
  const [randomizeQuestions, setRandomizeQuestions] = useState(true);
  const [randomizeOptions, setRandomizeOptions] = useState(true);
  const [resultVisibility, setResultVisibility] = useState("after_officer_release");

  const courseQuestions = useMemo(
    () => mock.questionBank.filter((q) => !q.courseCode || q.courseCode === courseCode),
    [courseCode],
  );

  const selectedQuestions = useMemo(
    () => courseQuestions.filter((q) => selectedQuestionIds.includes(q.id)),
    [courseQuestions, selectedQuestionIds],
  );

  const totalMarks = selectedQuestions.reduce((s, q) => s + q.marks, 0);

  function resetBuilder() {
    setStep(1);
    setCourseCode(ASSIGNED[0] ?? "");
    setTitle("");
    setInstructions("");
    setDuration(60);
    setSelectedQuestionIds([]);
    setStartAt("");
    setEndAt("");
    setFullscreen(true);
    setTabMonitoring(true);
    setMaxTabSwitches(5);
    setBlockCopyPaste(true);
    setRandomizeQuestions(true);
    setRandomizeOptions(true);
    setResultVisibility("after_officer_release");
  }

  function openBuilder() {
    resetBuilder();
    setBuilderOpen(true);
  }

  function toggleQuestion(id: string) {
    setSelectedQuestionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function canProceed(s: number): boolean {
    if (s === 1) {
      if (!courseCode) {
        toast.error("Select an assigned course");
        return false;
      }
      if (!ASSIGNED.includes(courseCode)) {
        toast.error("You can only create exams for courses assigned to you");
        return false;
      }
      if (!title.trim()) {
        toast.error("Examination title is required");
        return false;
      }
      if (duration < 5) {
        toast.error("Duration must be at least 5 minutes");
        return false;
      }
    }
    if (s === 2 && selectedQuestionIds.length === 0) {
      toast.error("Select at least one question");
      return false;
    }
    if (s === 3 && startAt && endAt && new Date(endAt) <= new Date(startAt)) {
      toast.error("End time must be after start time");
      return false;
    }
    return true;
  }

  function next() {
    if (!canProceed(step)) return;
    setStep((s) => Math.min(5, s + 1));
  }

  function back() {
    setStep((s) => Math.max(1, s - 1));
  }

  function saveDraft() {
    if (!canProceed(1)) return;
    const exam: Exam = {
      id: `te-${Date.now()}`,
      code: courseCode,
      title: title.trim(),
      course: courseLabel(courseCode),
      courseCode,
      date: startAt ? new Date(startAt).toLocaleString() : "Not scheduled",
      duration,
      questions: selectedQuestionIds.length,
      status: "draft",
      totalMarks,
      resultVisibility: resultVisibility as Exam["resultVisibility"],
    };
    setExams((prev) => [exam, ...prev]);
    toast.success("Draft saved. Submit for approval when ready.");
    setBuilderOpen(false);
  }

  function submitForApproval() {
    if (!canProceed(1) || !canProceed(2)) {
      setStep(selectedQuestionIds.length === 0 ? 2 : 1);
      return;
    }
    // Teachers cannot approve their own examination — always pending_approval
    const exam: Exam = {
      id: `te-${Date.now()}`,
      code: courseCode,
      title: title.trim(),
      course: courseLabel(courseCode),
      courseCode,
      date: startAt ? new Date(startAt).toLocaleString() : "Proposed schedule TBD",
      duration,
      questions: selectedQuestionIds.length,
      status: "pending_approval",
      totalMarks,
      resultVisibility: resultVisibility as Exam["resultVisibility"],
      createdBy: mock.currentTeacher.name,
    };
    setExams((prev) => [exam, ...prev]);
    toast.success("Examination submitted for Examination Officer approval");
    setBuilderOpen(false);
  }

  if (builderOpen) {
    return (
      <>
        <PageHeader
          title="Create Examination"
          description="Build the exam, then submit it for Examination Officer approval. You cannot approve your own exam."
          actions={
            <Button variant="outline" onClick={() => setBuilderOpen(false)}>
              Cancel
            </Button>
          }
        />

        {/* Steps */}
        <nav className="mb-6 flex flex-wrap gap-2" aria-label="Builder steps">
          {STEPS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => s.id < step && setStep(s.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                step === s.id
                  ? "border-primary bg-primary text-white"
                  : step > s.id
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-slate-200 bg-white text-slate-500",
              )}
            >
              <s.icon className="h-3.5 w-3.5" />
              {s.label}
            </button>
          ))}
        </nav>

        <SectionCard>
          {step === 1 && (
            <div className="mx-auto max-w-xl space-y-4">
              <div className="space-y-2">
                <Label className="font-semibold">Assigned course</Label>
                <Select value={courseCode} onValueChange={setCourseCode}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select course" />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSIGNED.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c} — {courseLabel(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">
                  Only courses assigned to you are listed.
                </p>
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Examination title</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. First Semester Examination"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Instructions for candidates</Label>
                <Textarea
                  rows={4}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Read each question carefully. Do not leave the examination window…"
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
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-600">
                  Select questions from your bank for <strong>{courseCode}</strong>. Selected:{" "}
                  <strong>{selectedQuestionIds.length}</strong> · Total marks:{" "}
                  <strong>{totalMarks}</strong>
                </p>
              </div>
              <ul className="space-y-2">
                {courseQuestions.map((q: Question) => {
                  const checked = selectedQuestionIds.includes(q.id);
                  return (
                    <li key={q.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                          checked
                            ? "border-primary/40 bg-primary/5"
                            : "border-slate-200 bg-white hover:bg-slate-50",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleQuestion(q.id)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900">{q.text}</p>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                            <StatusBadge status={q.type} />
                            <span>{q.marks} marks</span>
                            <span>{q.difficulty}</span>
                            <span>{q.topic}</span>
                          </div>
                        </div>
                      </label>
                    </li>
                  );
                })}
                {courseQuestions.length === 0 && (
                  <EmptyState
                    title="No questions for this course"
                    description="Add questions in Question Bank first."
                  />
                )}
              </ul>
            </div>
          )}

          {step === 3 && (
            <div className="mx-auto max-w-xl space-y-4">
              <p className="text-sm text-slate-600">
                Proposed schedule (Examination Officer may adjust when approving).
              </p>
              <div className="space-y-2">
                <Label className="font-semibold">Proposed start</Label>
                <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Proposed end</Label>
                <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Result visibility</Label>
                <Select value={resultVisibility} onValueChange={setResultVisibility}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="after_officer_release">After officer release</SelectItem>
                    <SelectItem value="after_marking">After marking complete</SelectItem>
                    <SelectItem value="after_exam_closes">After exam closes</SelectItem>
                    <SelectItem value="immediate">Immediate (objective only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="mx-auto max-w-xl space-y-4">
              <p className="text-sm text-slate-600">
                Security settings applied during CBT delivery.
              </p>
              <ToggleRow label="Fullscreen lockdown" checked={fullscreen} onChange={setFullscreen} />
              <ToggleRow label="Tab & focus monitoring" checked={tabMonitoring} onChange={setTabMonitoring} />
              <div className="space-y-2">
                <Label className="font-semibold">Max tab switches before flag</Label>
                <Input
                  type="number"
                  min={1}
                  value={maxTabSwitches}
                  onChange={(e) => setMaxTabSwitches(Number(e.target.value) || 5)}
                  disabled={!tabMonitoring}
                />
              </div>
              <ToggleRow label="Block copy / paste" checked={blockCopyPaste} onChange={setBlockCopyPaste} />
              <ToggleRow
                label="Randomise question order"
                checked={randomizeQuestions}
                onChange={setRandomizeQuestions}
              />
              <ToggleRow
                label="Randomise option order"
                checked={randomizeOptions}
                onChange={setRandomizeOptions}
              />
            </div>
          )}

          {step === 5 && (
            <div className="mx-auto max-w-xl space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <h3 className="font-extrabold text-slate-900">{title || "Untitled examination"}</h3>
                <dl className="mt-3 space-y-2 text-slate-600">
                  <div className="flex justify-between gap-4">
                    <dt>Course</dt>
                    <dd className="font-semibold text-slate-900">
                      {courseCode} — {courseLabel(courseCode)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Duration</dt>
                    <dd className="font-semibold text-slate-900">{duration} minutes</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Questions</dt>
                    <dd className="font-semibold text-slate-900">{selectedQuestionIds.length}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Total marks</dt>
                    <dd className="font-semibold text-slate-900">{totalMarks}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Schedule</dt>
                    <dd className="text-right font-semibold text-slate-900">
                      {startAt ? new Date(startAt).toLocaleString() : "Not set"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Security</dt>
                    <dd className="text-right text-xs font-medium text-slate-700">
                      {[fullscreen && "Fullscreen", tabMonitoring && "Tab monitor", blockCopyPaste && "No copy/paste"]
                        .filter(Boolean)
                        .join(" · ") || "Defaults"}
                    </dd>
                  </div>
                </dl>
              </div>
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Submitting sends this examination to the Examination Officer. Teachers cannot approve
                their own examinations.
              </p>
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <Button variant="outline" onClick={back} disabled={step === 1}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={saveDraft}>
                <Save className="mr-1.5 h-4 w-4" />
                Save draft
              </Button>
              {step < 5 ? (
                <Button className="font-semibold" onClick={next}>
                  Continue
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              ) : (
                <Button className="font-semibold" onClick={submitForApproval}>
                  <Send className="mr-1.5 h-4 w-4" />
                  Submit for approval
                </Button>
              )}
            </div>
          </div>
        </SectionCard>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Examinations"
        description="Create exams for your assigned courses. Submit for Examination Officer approval before delivery."
        actions={
          <Button className="font-semibold" onClick={openBuilder}>
            <Plus className="mr-1.5 h-4 w-4" />
            Create examination
          </Button>
        }
      />

      <SectionCard title="Your examinations">
        {exams.length === 0 ? (
          <EmptyState
            title="No examinations yet"
            description="Create an examination for one of your assigned courses."
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
                    {e.courseCode ?? e.code} · {e.course} · {e.duration} min · {e.questions} questions
                  </p>
                  <p className="text-xs text-slate-400">{e.date}</p>
                </div>
                <StatusBadge status={String(e.status).replaceAll("_", " ")} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}

function courseLabel(code: string) {
  const found = mock.studentCourses.find((c) => c.code === code);
  return found?.title ?? code;
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3">
      <span className="text-sm font-semibold text-slate-800">{label}</span>
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
    </label>
  );
}
