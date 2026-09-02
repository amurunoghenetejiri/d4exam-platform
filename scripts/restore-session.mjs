/**
 * One-shot restore: expands gzip+base64 parts into target source files.
 * Safe to keep; no-ops when parts are absent.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dir = path.join(root, "src/lib/_cbt_session_restore");
if (!fs.existsSync(dir)) process.exit(0);

function expand(prefix, targetRel) {
  const parts = [];
  for (let i = 0; ; i++) {
    const f = path.join(dir, `${prefix}_${i}.b64`);
    if (!fs.existsSync(f)) break;
    parts.push(fs.readFileSync(f, "utf8").trim());
  }
  if (!parts.length) return false;
  const b64 = parts.join("");
  const buf = zlib.gunzipSync(Buffer.from(b64, "base64"));
  const target = path.join(root, targetRel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buf);
  console.log("[restore]", targetRel, buf.length, "bytes");
  return true;
}

expand("cbt", "src/components/cbt/CbtExamSession.impl.tsx");
expand("off", "src/routes/officer.live-monitor.tsx");
