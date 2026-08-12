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
  correct_answer: string; // A|B|C|D or free text
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
  if (/^[1-4]$/.test(s)) return String.fromCharCode(64 + Number(s)); // 1→A
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

/** Normalize PDF text that often loses line breaks. */
function normalizePdfText(raw: string): string {
  let t = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Insert newlines before markers when PDF joined everything into one line
  t = t.replace(/\s*(QUESTION\s*\d+)/gi, "\n$1");
  t = t.replace(/\s+([A-D])[\).:\-]\s+/g, "\n$1. ");
  t = t.replace(/\s*(ANSWER\s*:)/gi, "\n$1");
  return t;
}

/** Parse recommended Word/PDF plain-text pattern. */
export function parseStructuredText(text: string): DraftQuestion[] {
  const normalized = normalizePdfText(text);
  const blocks = normalized
    .split(/\n(?=QUESTION\s*\d+)/i)
    .map((b) => b.trim())
    .filter(Boolean);

  const out: DraftQuestion[] = [];

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    let i = 0;
    if (/^QUESTION\s*\d+/i.test(lines[0])) i = 1;

    const questionLines: string[] = [];
    while (
      i < lines.length &&
      !/^[A-D][\).:\-\s]/i.test(lines[i]) &&
      !/^ANSWER\s*:/i.test(lines[i])
    ) {
      questionLines.push(lines[i]);
      i++;
    }

    const opts: Record<string, string> = { A: "", B: "", C: "", D: "" };
    while (i < lines.length && /^[A-D][\).:\-\s]/i.test(lines[i])) {
      const m = lines[i].match(/^([A-D])[\).:\-\s]+(.*)$/i);
      if (m) opts[m[1].toUpperCase()] = m[2].trim();
      i++;
    }

    let answer = "";
    while (i < lines.length) {
      const am = lines[i].match(/^ANSWER\s*:\s*(.*)$/i);
      if (am) {
        answer = normalizeCorrect(am[1]);
        break;
      }
      i++;
    }

    const hasOpts = Object.values(opts).some((v) => v.trim());
    out.push({
      localId: uid(),
      question_text: questionLines.join(" ").trim(),
      option_a: opts.A,
      option_b: opts.B,
      option_c: opts.C,
      option_d: opts.D,
      correct_answer: answer,
      question_type: hasOpts ? "mcq" : "short_answer",
      marks: 1,
      explanation: "",
      errors: [],
      selected: true,
    });
  }

  if (out.length === 0 && normalized.trim()) {
    const lines = normalized
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    let curQ = "";
    const opts: Record<string, string> = { A: "", B: "", C: "", D: "" };
    let answer = "";
    const flush = () => {
      if (!curQ.trim()) return;
      out.push({
        localId: uid(),
        question_text: curQ.trim(),
        option_a: opts.A,
        option_b: opts.B,
        option_c: opts.C,
        option_d: opts.D,
        correct_answer: answer,
        question_type: Object.values(opts).some((v) => v) ? "mcq" : "short_answer",
        marks: 1,
        explanation: "",
        errors: [],
        selected: true,
      });
      curQ = "";
      opts.A = opts.B = opts.C = opts.D = "";
      answer = "";
    };
    for (const line of lines) {
      if (/^ANSWER\s*:/i.test(line)) {
        answer = normalizeCorrect(line.replace(/^ANSWER\s*:\s*/i, ""));
        flush();
        continue;
      }
      const om = line.match(/^([A-D])[\).:\-\s]+(.*)$/i);
      if (om) {
        opts[om[1].toUpperCase()] = om[2].trim();
        continue;
      }
      if (Object.values(opts).some((v) => v) && curQ) {
        flush();
      }
      curQ = curQ ? `${curQ} ${line}` : line;
    }
    flush();
  }

  return validateAll(out);
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
        "No questions found in Word file. Use format:\nQUESTION 1\n...\nA. ...\nANSWER: B",
      );
    }
    return drafts;
  } catch (e) {
    if (e instanceof Error && e.message.includes("QUESTION 1")) throw e;
    throw new Error(
      "Could not read Word (.docx) file. Save as .docx (not .doc) or use CSV/Excel.",
    );
  }
}

export async function parsePdfFile(file: File): Promise<DraftQuestion[]> {
  let lastError: unknown;
  try {
    const pdfjs = await import("pdfjs-dist");

    // Browser: point worker at CDN matching installed major version when possible
    try {
      const version = (pdfjs as { version?: string }).version ?? "5.1.91";
      if (typeof window !== "undefined" && pdfjs.GlobalWorkerOptions) {
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
      }
    } catch {
      /* worker optional in some builds */
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
      // Rebuild approximate lines using Y position when available
      type Item = { str?: string; transform?: number[] };
      const items = content.items as Item[];
      let lastY: number | null = null;
      let line = "";
      for (const it of items) {
        const str = it.str ?? "";
        const y = it.transform?.[5];
        if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 6) {
          text += line.trim() + "\n";
          line = "";
        }
        line += (line && !line.endsWith(" ") ? " " : "") + str;
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
        "PDF text was read but no questions matched. Use this format:\n\nQUESTION 1\nWhat is …?\nA. …\nB. …\nC. …\nD. …\nANSWER: B",
      );
    }
    return drafts;
  } catch (e) {
    lastError = e;
    if (
      e instanceof Error &&
      (e.message.includes("QUESTION 1") ||
        e.message.includes("no selectable text") ||
        e.message.includes("scanned"))
    ) {
      throw e;
    }
    throw new Error(
      `Could not import this PDF (${lastError instanceof Error ? lastError.message : "unknown error"}). Prefer CSV/Excel template, or a text-based PDF with QUESTION / ANSWER labels.`,
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
