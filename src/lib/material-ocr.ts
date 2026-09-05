/**
 * Client-side handwriting/OCR via Tesseract.js.
 * No API keys — runs in the browser/WebView. Handwriting accuracy varies;
 * users can edit results before saving.
 */
export type OcrProgress = { status: string; progress: number };

export async function runImageOcr(
  source: string | Blob | File,
  onProgress?: (p: OcrProgress) => void,
): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    logger: (m) => {
      if (!onProgress) return;
      const progress = typeof m.progress === "number" ? m.progress : 0;
      onProgress({ status: String(m.status || "processing"), progress });
    },
  });
  try {
    const result = await worker.recognize(source);
    const text = (result.data?.text || "").replace(/\r\n/g, "\n").trim();
    return text;
  } finally {
    await worker.terminate().catch(() => undefined);
  }
}

/** Build a simple printable HTML document from OCR text for PDF export via print. */
export function ocrTextToPrintableHtml(title: string, body: string): string {
  const safeTitle = escapeHtml(title || "Converted notes");
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const lines = escapeHtml(p).replace(/\n/g, "<br/>");
      if (p.length < 80 && p === p.toUpperCase() && /[A-Z]/.test(p)) {
        return "<h2 style=\"margin:1.25rem 0 0.5rem;font-size:1.15rem;color:#0b1b3a\">" + lines + "</h2>";
      }
      return "<p style=\"margin:0.65rem 0;line-height:1.55\">" + lines + "</p>";
    })
    .join("\n");
  return (
    "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><title>" +
    safeTitle +
    "</title><style>body{font-family:Georgia,serif;max-width:720px;margin:2rem auto;padding:0 1.25rem;color:#111;background:#fff}h1{font-family:system-ui,sans-serif;font-size:1.35rem;color:#0b1b3a;border-bottom:2px solid #0b1b3a;padding-bottom:0.5rem}@media print{body{margin:0}}</style></head><body><h1>" +
    safeTitle +
    "</h1>" +
    (paragraphs || "<p>(No text)</p>") +
    "</body></html>"
  );
}

function escapeHtml(s: string) {
  const map: Record<string, string> = {
    "&": "&#38;",
    "<": "&#60;",
    ">": "&#62;",
    '"': "&#34;",
  };
  return s.replace(/[&<>"]/g, (ch) => map[ch] ?? ch);
}

export function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".txt") ? filename : `${filename}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function openPrintableOcr(title: string, text: string) {
  const html = ocrTextToPrintableHtml(title, text);
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  setTimeout(() => {
    try {
      w.focus();
      w.print();
    } catch {
      /* ignore */
    }
  }, 400);
  return true;
}
