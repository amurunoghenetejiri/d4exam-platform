/**
 * D4EXAM Question Import — deterministic extraction only.
 * NO AI generation, answering, or correction.
 */

export type ImportQuestionType =
  | "mcq"
  | "true_false"
  | "short_answer"
  | "essay"
  | "numerical";

export type DraftQuestion = {
  localId: string;
  question_text: string;
  question_type: ImportQuestionType;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  marks: number;
  explanation: string;
  errors: string[];
  selected: boolean;
};

export const TEMPLATE_HEADERS = [
  "Question",
  "Option A",
  "Option B",
  "Option C",
  "Option D",
  "Correct Answer",
  "Question Type",
  "Marks",
  "Explanation",
] as const;

export function downloadCsvTemplate() {
  const header = TEMPLATE_HEADERS.join(",");
  const example = [
    '"What is the capital of Nigeria?","Lagos","Abuja","Kano","Ibadan","B","mcq","1","Abuja is the capital"',
    '"The earth is flat","True","False","","","B","true_false","1",""',
    '"What is 5 x 5?","","","","","25","numerical","2",""',
  ].join("\n");
  const blob = new Blob([header + "\n" + example + "\n"], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "D4EXAM_Question_Import_Template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function uid() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeType(raw: string): ImportQuestionType {
  const t = raw.trim().toLowerCase().replace(/[\s/-]+/g, "_");
  if (t.includes("true") || t === "tf" || t === "t_f") return "true_false";
  if (t.includes("short")) return "short_answer";
  if (t.includes("essay") || t.includes("theory")) return "essay";
  if (t.includes("num")) return "numerical";
  if (t.includes("mcq") || t.includes("multiple")) return "mcq";
  return "mcq";
}

function normalizeCorrect(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  const letter = s.toUpperCase().replace(/[^A-D]/g, "");
  if (letter.length === 1 && "ABCD".includes(letter)) return letter;
  if (/^[1-4]$/.test(s)) return String.fromCharCode(64 + Number(s));
  return s;
}

export function validateDraft(q: DraftQuestion): string[] {
  const errors: string[] = [];
  if (!q.question_text.trim()) errors.push("Missing question text");
  if (!q.marks || q.marks < 1) errors.push("Marks must be at least 1");

  const needsOptions = q.question_type === "mcq" || q.question_type === "true_false";
  if (needsOptions) {
    if (q.question_type === "true_false") {
      if (!q.option_a.trim() && !q.option_b.trim()) {
        q.option_a = q.option_a || "True";
        q.option_b = q.option_b || "False";
      }
    }
    if (!q.option_a.trim() || !q.option_b.trim()) {
      errors.push("MCQ / True-False needs at least Option A and B");
    }
    const ca = q.correct_answer.trim().toUpperCase();
    if (!ca) {
      errors.push("Correct answer required (A, B, C, or D)");
    } else if (!["A", "B", "C", "D"].includes(ca)) {
      errors.push("Correct answer must be A, B, C, or D for option questions");
    } else {
      const map: Record<string, string> = {
        A: q.option_a,
        B: q.option_b,
        C: q.option_c,
        D: q.option_d,
      };
      if (!map[ca]?.trim()) errors.push(`Correct answer ${ca} has empty option text`);
    }
  } else if (q.question_type === "numerical" || q.question_type === "short_answer") {
    if (!q.correct_answer.trim()) {
      errors.push("Correct answer text is required (or enter during review)");
    }
  }
  return errors;
}

export function validateAll(rows: DraftQuestion[]): DraftQuestion[] {
  const seen = new Map<string, number>();
  return rows.map((q) => {
    const errors = validateDraft(q);
    const key = q.question_text.trim().toLowerCase();
    if (key) {
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      if (n > 1) errors.push("Duplicate question text in this import");
    }
    return { ...q, errors };
  });
}

function rowFromCells(cells: string[]): DraftQuestion {
  const get = (i: number) => (cells[i] ?? "").trim();
  return {
    localId: uid(),
    question_text: get(0),
    option_a: get(1),
    option_b: get(2),
    option_c: get(3),
    option_d: get(4),
    correct_answer: normalizeCorrect(get(5)),
    question_type: normalizeType(get(6) || "mcq"),
    marks: Math.max(1, Number(get(7)) || 1),
    explanation: get(8),
    errors: [],
    selected: true,
  };
}

export function parseCsv(text: string): DraftQuestion[] {
  const lines = splitCsvLines(text);
  if (lines.length === 0) return [];
  let start = 0;
  const first = lines[0].map((c) => c.toLowerCase());
  if (first.some((c) => c.includes("question"))) start = 1;
  const out: DraftQuestion[] = [];
  for (let i = start; i < lines.length; i++) {
    if (lines[i].every((c) => !c.trim())) continue;
    out.push(rowFromCells(lines[i]));
  }
  return validateAll(out);
}

function splitCsvLines(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else cur += ch;
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

function makeDraft(partial: Partial<DraftQuestion> & { question_text: string }): DraftQuestion {
  return {
    localId: uid(),
    question_type: "mcq",
    option_a: "",
    option_b: "",
    option_c: "",
    option_d: "",
    correct_answer: "",
    marks: 1,
    explanation: "",
    errors: [],
    selected: true,
    ...partial,
  };
}

/** Normalize PDF/Word text that often loses line breaks. */
function normalizeExtractedText(raw: string): string {
  let t = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Collapse excessive spaces but keep intentional newlines
  t = t.replace(/[ \t]+/g, " ");
  // Markers → new lines
  t = t.replace(/\s*(QUESTION\s*\d+\s*[:.)]?)/gi, "\n$1\n");
  t = t.replace(/\s*(Q\s*\d+\s*[:.)])/gi, "\n$1\n");
  // Numbered stems: "1." "2)" "3:" at start-ish
  t = t.replace(/(?:^|\n)\s*(\d{1,3})[.)]\s+/g, "\n$1. ");
  t = t.replace(/\s+([A-Da-d])[)\].:\-]\s+/g, "\n$1. ");
  t = t.replace(/\s*(ANSWER\s*[:：])/gi, "\n$1 ");
  t = t.replace(/\s*(Ans(?:wer)?\s*[:：])/gi, "\n$1 ");
  return t;
}

const OPTION_LINE = /^([A-Da-d])[)\].:\-\s]+\s*(.+)$/;
const ANSWER_LINE = /^(?:ANSWER|ANS(?:WER)?)\s*[:：]\s*(.+)$/i;
const QUESTION_HDR = /^(?:QUESTION|Q)\s*(\d+)\s*[:.)]?\s*(.*)$/i;
const NUMBERED_STEM = /^(\d{1,3})[.)]\s+(.+)$/;

/** Strategy A: QUESTION N / Q N blocks */
function parseQuestionHeaderBlocks(lines: string[]): DraftQuestion[] {
  const out: DraftQuestion[] = [];
  let i = 0;
  while (i < lines.length) {
    const hdr = lines[i].match(QUESTION_HDR);
    if (!hdr) {
      i++;
      continue;
    }
    i++;
    const questionLines: string[] = [];
    if (hdr[2]?.trim()) questionLines.push(hdr[2].trim());
    while (
      i < lines.length &&
      !OPTION_LINE.test(lines[i]) &&
      !ANSWER_LINE.test(lines[i]) &&
      !QUESTION_HDR.test(lines[i]) &&
      !NUMBERED_STEM.test(lines[i])
    ) {
      questionLines.push(lines[i]);
      i++;
    }
    const opts: Record<string, string> = { A: "", B: "", C: "", D: "" };
    while (i < lines.length && OPTION_LINE.test(lines[i])) {
      const m = lines[i].match(OPTION_LINE)!;
      opts[m[1].toUpperCase()] = m[2].trim();
      i++;
    }
    let answer = "";
    if (i < lines.length && ANSWER_LINE.test(lines[i])) {
      answer = normalizeCorrect(lines[i].replace(ANSWER_LINE, "$1"));
      i++;
    }
    const hasOpts = Object.values(opts).some((v) => v.trim());
    const text = questionLines.join(" ").trim();
    if (text) {
      out.push(
        makeDraft({
          question_text: text,
          option_a: opts.A,
          option_b: opts.B,
          option_c: opts.C,
          option_d: opts.D,
          correct_answer: answer,
          question_type: hasOpts ? "mcq" : "short_answer",
        }),
      );
    }
  }
  return out;
}

/** Strategy B: numbered items 1. 2. 3. with A/B/C/D options */
function parseNumberedMcqBlocks(lines: string[]): DraftQuestion[] {
  const out: DraftQuestion[] = [];
  let i = 0;
  while (i < lines.length) {
    const stem = lines[i].match(NUMBERED_STEM);
    if (!stem) {
      i++;
      continue;
    }
    // Avoid treating option-like "A. text" — NUMBERED is digits only
    i++;
    const questionLines: string[] = [stem[2].trim()];
    while (
      i < lines.length &&
      !OPTION_LINE.test(lines[i]) &&
      !ANSWER_LINE.test(lines[i]) &&
      !NUMBERED_STEM.test(lines[i]) &&
      !QUESTION_HDR.test(lines[i])
    ) {
      questionLines.push(lines[i]);
      i++;
    }
    const opts: Record<string, string> = { A: "", B: "", C: "", D: "" };
    let optionCount = 0;
    while (i < lines.length && OPTION_LINE.test(lines[i])) {
      const m = lines[i].match(OPTION_LINE)!;
      opts[m[1].toUpperCase()] = m[2].trim();
      optionCount++;
      i++;
    }
    let answer = "";
    if (i < lines.length && ANSWER_LINE.test(lines[i])) {
      answer = normalizeCorrect(lines[i].replace(ANSWER_LINE, "$1"));
      i++;
    }
    // Only keep if it looks like a real MCQ (has options) or a solid stem
    const text = questionLines.join(" ").trim();
    if (!text || text.length < 3) continue;
    if (optionCount === 0 && text.length < 12) continue;
    out.push(
      makeDraft({
        question_text: text,
        option_a: opts.A,
        option_b: opts.B,
        option_c: opts.C,
        option_d: opts.D,
        correct_answer: answer,
        question_type: optionCount >= 2 ? "mcq" : "short_answer",
      }),
    );
  }
  return out;
}

/** Strategy C: stream walk — stem then options until next stem */
function parseStreamMcq(lines: string[]): DraftQuestion[] {
  const out: DraftQuestion[] = [];
  let curQ = "";
  const opts: Record<string, string> = { A: "", B: "", C: "", D: "" };
  let answer = "";

  const flush = () => {
    if (!curQ.trim()) return;
    const hasOpts = Object.values(opts).some((v) => v);
    out.push(
      makeDraft({
        question_text: curQ.trim(),
        option_a: opts.A,
        option_b: opts.B,
        option_c: opts.C,
        option_d: opts.D,
        correct_answer: answer,
        question_type: hasOpts ? "mcq" : "short_answer",
      }),
    );
    curQ = "";
    opts.A = opts.B = opts.C = opts.D = "";
    answer = "";
  };

  for (const line of lines) {
    if (ANSWER_LINE.test(line)) {
      answer = normalizeCorrect(line.replace(ANSWER_LINE, "$1"));
      flush();
      continue;
    }
    const om = line.match(OPTION_LINE);
    if (om) {
      opts[om[1].toUpperCase()] = om[2].trim();
      continue;
    }
    if (QUESTION_HDR.test(line) || NUMBERED_STEM.test(line)) {
      if (curQ || Object.values(opts).some((v) => v)) flush();
      const qh = line.match(QUESTION_HDR);
      const ns = line.match(NUMBERED_STEM);
      curQ = (qh?.[2] || ns?.[2] || line).trim();
      continue;
    }
    if (Object.values(opts).some((v) => v) && curQ) {
      flush();
    }
    curQ = curQ ? `${curQ} ${line}` : line;
  }
  flush();
  return out;
}

/** Prefer the strategy that yields the most valid-looking questions. */
export function parseStructuredText(text: string): DraftQuestion[] {
  const normalized = normalizeExtractedText(text);
  const lines = normalized
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const candidates = [
    parseQuestionHeaderBlocks(lines),
    parseNumberedMcqBlocks(lines),
    parseStreamMcq(lines),
  ];

  // Score: prefer more items with options and non-empty stems
  let best: DraftQuestion[] = [];
  let bestScore = -1;
  for (const list of candidates) {
    const score = list.reduce((s, q) => {
      let n = q.question_text.trim().length > 5 ? 2 : 0;
      if (q.option_a && q.option_b) n += 3;
      if (q.option_c) n += 1;
      if (q.correct_answer) n += 1;
      return s + n;
    }, 0);
    if (list.length > best.length || (list.length === best.length && score > bestScore)) {
      if (list.length >= best.length) {
        best = list;
        bestScore = score;
      }
    }
  }

  // Merge if header strategy found few but numbered found many
  const byLen = [...candidates].sort((a, b) => b.length - a.length);
  if (byLen[0] && byLen[0].length > best.length) best = byLen[0];

  // Drop empty / garbage
  best = best.filter((q) => q.question_text.trim().length >= 3);

  return validateAll(best);
}

export async function parseSpreadsheetFile(file: File): Promise<DraftQuestion[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    const text = await file.text();
    return parseCsv(text);
  }
  try {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      defval: "",
    }) as string[][];
    if (!rows.length) return [];
    let start = 0;
    const head = (rows[0] ?? []).map((c) => String(c).toLowerCase());
    if (head.some((c) => c.includes("question"))) start = 1;
    const out: DraftQuestion[] = [];
    for (let i = start; i < rows.length; i++) {
      const cells = (rows[i] ?? []).map((c) => String(c ?? ""));
      if (cells.every((c) => !c.trim())) continue;
      out.push(rowFromCells(cells));
    }
    return validateAll(out);
  } catch {
    throw new Error(
      "Could not read Excel file. Export as CSV and try again, or use the Template button.",
    );
  }
}

export async function parseDocxFile(file: File): Promise<DraftQuestion[]> {
  try {
    const mammoth = await import("mammoth");
    const buf = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    const drafts = parseStructuredText(result.value || "");
    if (!drafts.length) {
      throw new Error(
        "No questions found in Word file. Use numbered items or:\nQUESTION 1\n...\nA. ...\nANSWER: B",
      );
    }
    return drafts;
  } catch (e) {
    if (e instanceof Error && e.message.includes("QUESTION 1")) throw e;
    if (e instanceof Error && e.message.includes("No questions found")) throw e;
    throw new Error(
      "Could not read Word (.docx) file. Save as .docx (not .doc) or use CSV/Excel.",
    );
  }
}

export async function parsePdfFile(file: File): Promise<DraftQuestion[]> {
  let lastError: unknown;
  try {
    const pdfjs = await import("pdfjs-dist");

    try {
      const version = (pdfjs as { version?: string }).version ?? "5.1.91";
      if (typeof window !== "undefined" && pdfjs.GlobalWorkerOptions) {
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
      }
    } catch {
      /* optional */
    }

    const buf = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({
      data: buf,
      useSystemFonts: true,
      isEvalSupported: false,
      useWorkerFetch: false,
    });
    const pdf = await loadingTask.promise;

    let text = "";
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      type Item = { str?: string; transform?: number[]; hasEOL?: boolean };
      const items = content.items as Item[];
      let lastY: number | null = null;
      let line = "";
      for (const it of items) {
        const str = it.str ?? "";
        const y = it.transform?.[5];
        if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 5) {
          text += line.trim() + "\n";
          line = "";
        }
        line += (line && !line.endsWith(" ") ? " " : "") + str;
        if (it.hasEOL) {
          text += line.trim() + "\n";
          line = "";
          lastY = null;
          continue;
        }
        if (y !== undefined) lastY = y;
      }
      if (line.trim()) text += line.trim() + "\n";
      text += "\n";
    }

    if (!text.replace(/\s/g, "").length) {
      throw new Error(
        "This PDF has no selectable text (it may be a scanned image). Use a text PDF, Word, or CSV/Excel.",
      );
    }

    const drafts = parseStructuredText(text);
    if (!drafts.length) {
      throw new Error(
        "PDF text was read but no questions matched. Prefer numbered questions (1. … A. B. C. D.) or QUESTION 1 / ANSWER: B format.",
      );
    }
    return drafts;
  } catch (e) {
    lastError = e;
    if (
      e instanceof Error &&
      (e.message.includes("QUESTION") ||
        e.message.includes("no selectable text") ||
        e.message.includes("scanned") ||
        e.message.includes("no questions matched"))
    ) {
      throw e;
    }
    throw new Error(
      `Could not import this PDF (${lastError instanceof Error ? lastError.message : "unknown error"}). Prefer CSV/Excel, or a text PDF with numbered questions.`,
    );
  }
}

export async function parseImportFile(file: File): Promise<DraftQuestion[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return parseSpreadsheetFile(file);
  }
  if (name.endsWith(".docx")) return parseDocxFile(file);
  if (name.endsWith(".pdf")) return parsePdfFile(file);
  throw new Error("Unsupported file type. Use .xlsx, .xls, .csv, .docx, or .pdf");
}
