/**
 * Build a simple multi-page PDF from image Files (JPEG/PNG/WebP).
 * Uses canvas → JPEG embed so no extra npm package is required.
 */

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read image: ${file.name}`));
    };
    img.src = url;
  });
}

function imageToJpegBytes(img: HTMLImageElement, maxEdge = 1600, quality = 0.85): {
  data: Uint8Array;
  width: number;
  height: number;
} {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height, 1));
  const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  const b64 = dataUrl.split(",")[1] || "";
  const bin = atob(b64);
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
  return { data, width: w, height: h };
}

function str(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Convert one or more image files into a single PDF Blob. */
export async function imagesToPdfBlob(files: File[], title = "Notes"): Promise<Blob> {
  if (!files.length) throw new Error("No images");
  const pages: { jpeg: Uint8Array; w: number; h: number }[] = [];
  for (const f of files) {
    const img = await loadImage(f);
    const { data, width, height } = imageToJpegBytes(img);
    pages.push({ jpeg: data, w: width, h: height });
  }

  type Part = { kind: "obj"; num: number; content: Uint8Array };
  const parts: Part[] = [];
  let objNum = 1;

  const catalogNum = objNum++;
  const pagesNum = objNum++;
  const pageNums: number[] = [];
  const contentNums: number[] = [];
  const imageNums: number[] = [];

  for (let i = 0; i < pages.length; i++) {
    pageNums.push(objNum++);
    contentNums.push(objNum++);
    imageNums.push(objNum++);
  }

  const kids = pageNums.map((n) => `${n} 0 R`).join(" ");
  parts.push({
    kind: "obj",
    num: catalogNum,
    content: str(`${catalogNum} 0 obj\n<< /Type /Catalog /Pages ${pagesNum} 0 R >>\nendobj\n`),
  });
  parts.push({
    kind: "obj",
    num: pagesNum,
    content: str(
      `${pagesNum} 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`,
    ),
  });

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const pageN = pageNums[i];
    const contentN = contentNums[i];
    const imageN = imageNums[i];
    const w = p.w;
    const h = p.h;

    parts.push({
      kind: "obj",
      num: pageN,
      content: str(
        `${pageN} 0 obj\n<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im${i} ${imageN} 0 R >> >> /Contents ${contentN} 0 R >>\nendobj\n`,
      ),
    });

    const stream = `q\n${w} 0 0 ${h} 0 0 cm\n/Im${i} Do\nQ\n`;
    parts.push({
      kind: "obj",
      num: contentN,
      content: str(
        `${contentN} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`,
      ),
    });

    const imgHeader = str(
      `${imageN} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
    );
    const imgFooter = str(`\nendstream\nendobj\n`);
    parts.push({
      kind: "obj",
      num: imageN,
      content: concat([imgHeader, p.jpeg, imgFooter]),
    });
  }

  const header = str(`%PDF-1.4\n%\xE2\xE3\xCF\xD3\n`);
  const chunks: Uint8Array[] = [header];
  let offset = header.length;
  const xrefOffsets: number[] = [0];

  const byNum = new Map(parts.map((p) => [p.num, p]));
  const maxObj = objNum - 1;
  for (let n = 1; n <= maxObj; n++) {
    const part = byNum.get(n);
    if (!part) continue;
    xrefOffsets[n] = offset;
    chunks.push(part.content);
    offset += part.content.length;
  }

  const xrefStart = offset;
  let xref = `xref\n0 ${maxObj + 1}\n`;
  xref += `0000000000 65535 f \n`;
  for (let n = 1; n <= maxObj; n++) {
    const off = xrefOffsets[n] ?? 0;
    xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${maxObj + 1} /Root ${catalogNum} 0 R /Info (${title.replace(/[()\\]/g, "")}) >>\n`;
  xref += `startxref\n${xrefStart}\n%%EOF\n`;

  chunks.push(str(xref));
  return new Blob([concat(chunks)], { type: "application/pdf" });
}

export function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);
}
