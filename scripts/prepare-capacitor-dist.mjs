/**
 * Prepare dist/ for Capacitor Android (bundled shell, no Vercel dependency).
 *
 * 1. Prefer Vite/Nitro client output (.output/public or dist)
 * 2. Generate a real index.html that loads the client JS bundle
 * 3. Copy offline.html and other static public assets
 *
 * Never write a meta-refresh to d4exam-platform.vercel.app.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const outputPublic = path.join(root, ".output", "public");

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

if (fs.existsSync(outputPublic)) {
  console.log("[prepare-capacitor-dist] Copying .output/public → dist");
  fs.mkdirSync(dist, { recursive: true });
  copyDir(outputPublic, dist);
}

const publicDir = path.join(root, "public");
if (fs.existsSync(publicDir)) {
  for (const name of fs.readdirSync(publicDir)) {
    const s = path.join(publicDir, name);
    const d = path.join(dist, name);
    if (fs.statSync(s).isFile()) {
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.copyFileSync(s, d);
    }
  }
}

const assetsDir = path.join(dist, "assets");
if (!fs.existsSync(assetsDir)) {
  console.error("FATAL: dist/assets missing after build. Run `npm run build` first.");
  process.exit(1);
}

const gen = path.join(root, "scripts", "generate-capacitor-index.mjs");
const r = spawnSync(process.execPath, [gen], { cwd: root, stdio: "inherit" });
if (r.status !== 0) {
  process.exit(r.status || 1);
}

const indexPath = path.join(dist, "index.html");
if (!fs.existsSync(indexPath)) {
  console.error("FATAL: dist/index.html was not generated");
  process.exit(1);
}

const indexHtml = fs.readFileSync(indexPath, "utf8");
if (indexHtml.includes("d4exam-platform.vercel.app")) {
  console.error("FATAL: dist/index.html still references Vercel — refusing to package");
  process.exit(1);
}

const offlinePath = path.join(dist, "offline.html");
if (fs.existsSync(offlinePath)) {
  let offline = fs.readFileSync(offlinePath, "utf8");
  offline = offline.replace(/https:\/\/d4exam-platform\.vercel\.app\/?/g, "./");
  offline = offline.replace(/window\.location\.replace\(\s*LIVE[^)]*\)/g, "window.location.reload()");
  offline = offline.replace(/window\.location\.href\s*=\s*LIVE/g, "window.location.reload()");
  fs.writeFileSync(offlinePath, offline, "utf8");
}

console.log("[prepare-capacitor-dist] Ready. dist/ is a local Capacitor shell (no Vercel URL).");
console.log(
  "  assets:",
  fs.readdirSync(assetsDir).length,
  "files; index.html:",
  fs.statSync(indexPath).size,
  "bytes",
);
