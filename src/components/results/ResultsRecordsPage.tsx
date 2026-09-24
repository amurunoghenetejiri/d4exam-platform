import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  FileSpreadsheet,
  Loader2,
  Printer,
  Search,
} from "lucide-react";
import { PageHeader, EmptyState, SectionCard } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSessionUser, type SessionUser } from "@/lib/session";
import {
  loadFilterOptions,
  loadScopedExams,
  loadExamResultRecord,
  resultsToCsv,
  computeResultAnalytics,
  type ResultFilters,
} from "@/lib/results-records";
import { gradeColorClass } from "@/lib/resolve-student-details";
import { cn } from "@/lib/utils";

type Props = {
  forcedSchoolId?: string | null;
  title?: string;
  description?: string;
  showAnalysisTab?: boolean;
};

export function ResultsRecordsPage({
  forcedSchoolId,
  title = "Result Records",
  description = "Select an examination or test, then view, print or export official scores.",
  showAnalysisTab = false,
}: Props) {
  const { data: user } = useSessionUser();
  const printRef = useRef<HTMLDivElement>(null);
  const schoolId = forcedSchoolId || user?.schoolId || null;

  const [sessionId, setSessionId] = useState("");
  const [semesterId, setSemesterId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [assessment, setAssessment] = useState<"all" | "test" | "examination">("all");
  const [examId, setExamId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"results" | "analysis">("results");

  const filters: ResultFilters = useMemo(
    () => ({
      schoolId,
      sessionId: sessionId || null,
      semesterId: semesterId || null,
      departmentId: departmentId || null,
      levelId: levelId || null,
      courseId: courseId || null,
      assessment,
    }),
    [schoolId, sessionId, semesterId, departmentId, levelId, courseId, assessment],
  );

  const optsQ = useQuery({
    queryKey: ["result-filter-opts", schoolId],
    enabled: Boolean(schoolId) || user?.role === "super_admin",
    queryFn: () => loadFilterOptions(schoolId),
  });

  const examsQ = useQuery({
    queryKey: ["result-scoped-exams", user?.userId, user?.role, filters],
    enabled: Boolean(user),
    queryFn: () => loadScopedExams(user as SessionUser, filters),
  });

  const recordQ = useQuery({
    queryKey: ["result-record", examId, user?.userId],
    enabled: Boolean(user && examId),
    queryFn: () => loadExamResultRecord(user as SessionUser, examId),
  });

  const exams = examsQ.data ?? [];
  const record = recordQ.data;
  const isTest = record?.assessment === "test";
  const analytics = useMemo(() => computeResultAnalytics(record?.rows ?? []), [record?.rows]);

  const filteredRows = useMemo(() => {
    const rows = record?.rows ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        r.matric.toLowerCase().includes(q) ||
        r.departmentName.toLowerCase().includes(q),
    );
  }, [record?.rows, search]);

  function printRecord() {
    if (!printRef.current) return;
    const html = printRef.current.innerHTML;
    const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Examination Result</title>
      <style>
        body{font-family:system-ui,-apple-system,sans-serif;color:#0f172a;padding:24px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #cbd5e1;padding:8px 10px;text-align:left}
        th{background:#0b1b3a;color:#fff}
        .grade-A,.grade-B{color:#059669;font-weight:800}
        .grade-C{color:#d97706;font-weight:800}
        .grade-F{color:#dc2626;font-weight:800}
        @media print{body{padding:12px}}
      </style></head><body>${html}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  function exportCsv() {
    if (!record) return;
    const csv = resultsToCsv(record.header, filteredRows, isTest);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${record.header.courseCode || "result"}-${record.header.assessmentLabel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!user) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (user.role !== "super_admin" && !schoolId) {
    return (
      <>
        <PageHeader title={title} description={description} />
        <EmptyState title="No school linked" description="Sign in with a school account to view results." />
      </>
    );
  }

  const opts = optsQ.data;
  const semestersFiltered = (opts?.semesters ?? []).filter((s) => !sessionId || s.extra === sessionId);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title={title} description={description} />

      {showAnalysisTab ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab("results")}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold transition",
              tab === "results" ? "bg-primary text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
            )}
          >
            Results
          </button>
          <button
            type="button"
            onClick={() => setTab("analysis")}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold transition",
              tab === "analysis" ? "bg-primary text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
            )}
          >
            <BarChart3 className="mr-1 inline h-3.5 w-3.5" />
            Analysis
          </button>
        </div>
      ) : null}

      <SectionCard title="Filters" className="mt-2">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <FilterSelect label="Academic Session" value={sessionId} onChange={(v) => { setSessionId(v); setSemesterId(""); setExamId(""); }} options={opts?.sessions ?? []} />
          <FilterSelect label="Semester" value={semesterId} onChange={(v) => { setSemesterId(v); setExamId(""); }} options={semestersFiltered} />
          <FilterSelect label="Department" value={departmentId} onChange={(v) => { setDepartmentId(v); setExamId(""); }} options={opts?.departments ?? []} />
          <FilterSelect label="Level" value={levelId} onChange={(v) => { setLevelId(v); setExamId(""); }} options={opts?.levels ?? []} />
          <FilterSelect label="Course" value={courseId} onChange={(v) => { setCourseId(v); setExamId(""); }} options={opts?.courses ?? []} />
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Assessment</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={assessment}
              onChange={(e) => { setAssessment(e.target.value as "all" | "test" | "examination"); setExamId(""); }}
            >
              <option value="all">All</option>
              <option value="test">Test</option>
              <option value="examination">Exam</option>
            </select>
          </div>
        </div>

        {/* Compact exam selector — no long sidebar list */}
        <div className="mt-4 space-y-1">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Select examination / test
          </label>
          {examsQ.isLoading ? (
            <p className="text-sm text-slate-500">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Loading assessments…
            </p>
          ) : (
            <select
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm font-medium"
              value={examId}
              onChange={(e) => {
                setExamId(e.target.value);
                setTab("results");
              }}
            >
              <option value="">— Choose an assessment —</option>
              {exams.map((e) => {
                const code = e.courses?.code || "";
                const label = code ? `${code} · ${e.title}` : e.title;
                return (
                  <option key={e.id} value={e.id}>
                    {label} ({e.status})
                  </option>
                );
              })}
            </select>
          )}
          {!examsQ.isLoading && exams.length === 0 ? (
            <p className="text-xs text-slate-500">No assessments match these filters.</p>
          ) : null}
        </div>
      </SectionCard>

      <div className="mt-4 min-w-0">
        {!examId ? (
          <SectionCard title="Result record">
            <EmptyState
              title="Select an examination or test"
              description="Use the dropdown above to open official scores for that assessment."
            />
          </SectionCard>
        ) : recordQ.isLoading ? (
          <SectionCard title="Loading…">
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          </SectionCard>
        ) : !record ? (
          <SectionCard title="Result record">
            <EmptyState title="Could not load this result" description="You may not have access, or no data exists yet." />
          </SectionCard>
        ) : showAnalysisTab && tab === "analysis" ? (
          <SectionCard title={`Analysis — ${record.header.title}`}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Stat label="Students" value={String(analytics.count)} />
              <Stat label="Average score" value={analytics.averagePct != null ? `${analytics.averagePct.toFixed(1)}%` : "—"} />
              <Stat label="Pass rate" value={analytics.passRate != null ? `${analytics.passRate.toFixed(1)}%` : "—"} />
              <Stat label="Fail rate" value={analytics.failRate != null ? `${analytics.failRate.toFixed(1)}%` : "—"} />
              <Stat label="Highest" value={analytics.highest != null ? `${analytics.highest.toFixed(1)}%` : "—"} />
              <Stat label="Lowest" value={analytics.lowest != null ? `${analytics.lowest.toFixed(1)}%` : "—"} />
            </div>
            <div className="mt-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Grade distribution</p>
              <div className="flex flex-wrap gap-2">
                {Object.keys(analytics.gradeDist).length === 0 ? (
                  <p className="text-sm text-slate-500">No grades yet.</p>
                ) : (
                  Object.entries(analytics.gradeDist)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([g, n]) => (
                      <span key={g} className={cn("rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm", gradeColorClass(g))}>
                        {g}: {n}
                      </span>
                    ))
                )}
              </div>
            </div>
          </SectionCard>
        ) : (
          <SectionCard title="Result record">
            <div className="mb-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => printRecord()}>
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                Print
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => printRecord()}>
                Print preview
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => exportCsv()}>
                <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
                Export CSV
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => printRecord()}>
                Export PDF
              </Button>
            </div>

            <div className="mb-3 flex items-center gap-2">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <Input
                placeholder="Search student name or matric…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm"
              />
            </div>

            <div ref={printRef} className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
              {/* Header: school logo left, title center — no D4EXAM brand mark */}
              <div className="mb-4 flex items-start gap-4 border-b border-slate-200 pb-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 sm:h-20 sm:w-20">
                  {record.header.schoolLogoUrl ? (
                    <img
                      src={record.header.schoolLogoUrl}
                      alt={record.header.schoolName || "School"}
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    <span className="text-[10px] font-bold uppercase text-slate-400">Logo</span>
                  )}
                </div>
                <div className="min-w-0 flex-1 text-center sm:pr-16">
                  <h1 className="text-lg font-extrabold text-slate-900 sm:text-xl">
                    {isTest ? "TEST RESULT" : "EXAMINATION RESULT"}
                  </h1>
                  {record.header.schoolName ? (
                    <p className="mt-1 text-sm font-semibold text-slate-600">{record.header.schoolName}</p>
                  ) : null}
                </div>
              </div>

              <div className="mb-5 grid gap-2 text-sm sm:grid-cols-2">
                <Meta label="Course Code" value={record.header.courseCode} />
                <Meta label="Course" value={record.header.courseName} />
                <Meta label="Department" value={record.header.departmentName} />
                <Meta label="Level" value={record.header.levelName} />
                <Meta label="Semester" value={record.header.semesterName} />
                <Meta label="Academic Session" value={record.header.sessionName} />
                <Meta label="Assessment" value={record.header.assessmentLabel} />
                <Meta label="Date" value={record.header.dateLabel} />
              </div>

              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="bg-[#0b1b3a] text-left text-white">
                    <th className="px-3 py-2.5 font-semibold">Student Full Name</th>
                    <th className="px-3 py-2.5 font-semibold">Matric Number</th>
                    <th className="px-3 py-2.5 font-semibold">Department</th>
                    <th className="px-3 py-2.5 font-semibold">Level</th>
                    <th className="px-3 py-2.5 font-semibold">Score</th>
                    {!isTest ? <th className="px-3 py-2.5 font-semibold">Grade</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={isTest ? 5 : 6} className="px-3 py-8 text-center text-slate-500">
                        No student results found for this assessment yet.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((r) => {
                      const sc =
                        r.score != null && r.maxScore != null
                          ? `${r.score}/${r.maxScore}`
                          : r.score != null
                            ? String(r.score)
                            : "—";
                      return (
                        <tr key={r.resultId} className="border-b border-slate-100 odd:bg-slate-50/80">
                          <td className="px-3 py-2 font-medium text-slate-900">
                            {r.fullName}
                            {r.isCarryover ? (
                              <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                                CO
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-slate-700">{r.matric}</td>
                          <td className="px-3 py-2 text-slate-700">{r.departmentName}</td>
                          <td className="px-3 py-2 text-slate-700">{r.levelName}</td>
                          <td className="px-3 py-2 font-semibold tabular-nums text-slate-900">{sc}</td>
                          {!isTest ? (
                            <td className={cn("px-3 py-2", gradeColorClass(r.grade))}>{r.grade || "—"}</td>
                          ) : null}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-slate-400">
                {filteredRows.length} student{filteredRows.length === 1 ? "" : "s"}
              </p>
            </div>
          </SectionCard>
        )}
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-slate-600">
      <span className="font-semibold text-slate-800">{label}:</span> {value}
    </p>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-extrabold text-slate-900">{value}</p>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; name: string }[];
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</label>
      <select
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}
