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
import { cn } from "@/lib/utils";

type Props = {
  forcedSchoolId?: string | null;
  title?: string;
  description?: string;
  /** Show Results | Analysis tabs (teacher) */
  showAnalysisTab?: boolean;
};

export function ResultsRecordsPage({
  forcedSchoolId,
  title = "Result Records",
  description = "Filter by session, semester, department, level, course and assessment. Print or export professional records.",
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
  const [examId, setExamId] = useState<string | null>(null);
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
    queryFn: () => loadExamResultRecord(user as SessionUser, examId!),
  });

  const exams = examsQ.data ?? [];
  const record = recordQ.data;
  const isTest = record?.assessment === "test";
  const analytics = useMemo(
    () => computeResultAnalytics(record?.rows ?? []),
    [record?.rows],
  );

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
    w.document.write(`<!DOCTYPE html><html><head><title>D4EXAM Result</title>
      <style>
        body{font-family:system-ui,-apple-system,sans-serif;color:#0f172a;padding:24px}
        h1{font-size:20px;margin:0 0 4px;letter-spacing:.04em}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #cbd5e1;padding:8px 10px;text-align:left}
        th{background:#0b1b3a;color:#fff}
        tr:nth-child(even) td{background:#f8fafc}
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
  const semestersFiltered = (opts?.semesters ?? []).filter(
    (s) => !sessionId || s.extra === sessionId,
  );

  return (
    <>
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
          <FilterSelect
            label="Academic Session"
            value={sessionId}
            onChange={(v) => {
              setSessionId(v);
              setSemesterId("");
              setExamId(null);
            }}
            options={opts?.sessions ?? []}
          />
          <FilterSelect
            label="Semester"
            value={semesterId}
            onChange={(v) => {
              setSemesterId(v);
              setExamId(null);
            }}
            options={semestersFiltered}
          />
          <FilterSelect
            label="Department"
            value={departmentId}
            onChange={(v) => {
              setDepartmentId(v);
              setExamId(null);
            }}
            options={opts?.departments ?? []}
          />
          <FilterSelect
            label="Level"
            value={levelId}
            onChange={(v) => {
              setLevelId(v);
              setExamId(null);
            }}
            options={opts?.levels ?? []}
          />
          <FilterSelect
            label="Course"
            value={courseId}
            onChange={(v) => {
              setCourseId(v);
              setExamId(null);
            }}
            options={opts?.courses ?? []}
          />
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Assessment</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={assessment}
              onChange={(e) => {
                setAssessment(e.target.value as "all" | "test" | "examination");
                setExamId(null);
              }}
            >
              <option value="all">All</option>
              <option value="test">Test</option>
              <option value="examination">Exam</option>
            </select>
          </div>
        </div>
      </SectionCard>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(240px,300px)_1fr]">
        <SectionCard title="Exams / Tests">
          {examsQ.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : examsQ.isError ? (
            <p className="text-sm text-red-600">Could not load examinations. Try refresh.</p>
          ) : exams.length === 0 ? (
            <p className="text-sm text-slate-500">
              No assessments found for this school
              {sessionId || departmentId || courseId ? " with the current filters" : ""}.
            </p>
          ) : (
            <ul className="max-h-[28rem] space-y-1 overflow-y-auto">
              {exams.map((e) => {
                const active = examId === e.id;
                const code = e.courses?.code || "—";
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setExamId(e.id);
                        setTab("results");
                      }}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-left transition",
                        active
                          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                          : "border-slate-200 bg-white hover:border-slate-300",
                      )}
                    >
                      <p className="text-xs font-bold text-primary">{code}</p>
                      <p className="truncate text-sm font-semibold text-slate-900">{e.title}</p>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">{e.status}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <div className="min-w-0 space-y-3">
          {!examId ? (
            <SectionCard title={tab === "analysis" ? "Analysis" : "Result record"}>
              <EmptyState
                title="Choose an exam or test"
                description="Select an assessment from the list to view student scores and analysis."
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
              <EmptyState
                title="No access or no data"
                description="This assessment is outside your role scope, or could not be loaded."
              />
            </SectionCard>
          ) : showAnalysisTab && tab === "analysis" ? (
            <SectionCard title={`Analysis — ${record.header.title}`}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Stat label="Students" value={String(analytics.count)} />
                <Stat
                  label="Average score"
                  value={analytics.averagePct != null ? `${analytics.averagePct.toFixed(1)}%` : "—"}
                />
                <Stat
                  label="Pass rate"
                  value={analytics.passRate != null ? `${analytics.passRate.toFixed(1)}%` : "—"}
                />
                <Stat
                  label="Fail rate"
                  value={analytics.failRate != null ? `${analytics.failRate.toFixed(1)}%` : "—"}
                />
                <Stat
                  label="Highest"
                  value={analytics.highest != null ? `${analytics.highest.toFixed(1)}%` : "—"}
                />
                <Stat
                  label="Lowest"
                  value={analytics.lowest != null ? `${analytics.lowest.toFixed(1)}%` : "—"}
                />
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
                        <span
                          key={g}
                          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-800"
                        >
                          {g}: {n}
                        </span>
                      ))
                  )}
                </div>
              </div>
              <p className="mt-4 text-xs text-slate-500">
                {record.header.courseCode} · {record.header.assessmentLabel} · {record.header.dateLabel}
              </p>
            </SectionCard>
          ) : (
            <SectionCard title="Result record">
              {/* Actions: own row so they never cover the table on desktop */}
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
                <div className="mb-4 border-b border-slate-200 pb-4 text-center">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">D4EXAM</p>
                  <h1 className="mt-1 text-lg font-extrabold text-slate-900 sm:text-xl">
                    {isTest ? "TEST RESULT" : "EXAMINATION RESULT"}
                  </h1>
                  {record.header.schoolName ? (
                    <p className="mt-1 text-sm font-semibold text-slate-600">{record.header.schoolName}</p>
                  ) : null}
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
                  {isTest && record.header.maxScore != null ? (
                    <Meta label="Score scale" value={`Out of ${record.header.maxScore}`} />
                  ) : null}
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
                        <td
                          colSpan={isTest ? 5 : 6}
                          className="px-3 py-8 text-center text-slate-500"
                        >
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
                              <td className="px-3 py-2 font-bold text-slate-900">{r.grade || "—"}</td>
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
    </>
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
