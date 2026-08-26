/**
 * Prepare dist/ for Capacitor Android SPA shell (no Vercel).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const distCap = path.join(root, "dist-capacitor");

console.log("[prepare-capacitor-dist] Building Capacitor SPA (client-only)…");
const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
const build = spawnSync(
  process.execPath,
  [viteBin, "build", "--config", "vite.capacitor.config.ts"],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "production",
      VITE_CONFIG_NATIVE_IGNORE_WARNING: "true",
    },
  },
);
if (build.status !== 0) {
  console.error("FATAL: Capacitor SPA build failed");
  process.exit(build.status || 1);
}

if (!fs.existsSync(path.join(distCap, "capacitor-app.js"))) {
  console.error("FATAL: dist-capacitor/capacitor-app.js missing");
  process.exit(1);
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, "assets"), { recursive: true });

for (const name of fs.readdirSync(distCap)) {
  const s = path.join(distCap, name);
  if (fs.statSync(s).isFile()) {
    fs.copyFileSync(s, path.join(dist, "assets", name));
  }
}

const publicDir = path.join(root, "public");
if (fs.existsSync(publicDir)) {
  for (const name of fs.readdirSync(publicDir)) {
    const s = path.join(publicDir, name);
    if (fs.statSync(s).isFile()) {
      fs.copyFileSync(s, path.join(dist, name));
    }
  }
}

const cssFile = fs.readdirSync(path.join(dist, "assets")).find((f) => f.endsWith(".css"));
const cssLink = cssFile ? `<link rel="stylesheet" href="./assets/${cssFile}" />` : "";

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0b1b3a" />
    <title>D4EXAM</title>
    ${cssLink}
    <style>
      html, body { margin: 0; min-height: 100%; background: #0b1b3a; }
      #root { min-height: 100dvh; }
      #d4-boot {
        position: fixed; inset: 0; z-index: 99999; display: grid; place-items: center;
        background: #0b1b3a; color: #e2e8f0; font-family: system-ui, sans-serif; text-align: center;
        padding: max(1rem, env(safe-area-inset-top)) 1.25rem max(1rem, env(safe-area-inset-bottom));
      }
      #d4-boot .mark {
        width: 72px; height: 72px; margin: 0 auto 1rem; border-radius: 18px;
        background: #1e3a5f; display: grid; place-items: center;
        font-weight: 800; font-size: 1.25rem; color: #93c5fd;
      }
      #d4-boot .spin {
        width: 36px; height: 36px; margin: 0 auto 1rem;
        border: 3px solid #1e3a5f; border-top-color: #3b82f6;
        border-radius: 50%; animation: d4spin 0.8s linear infinite;
      }
      @keyframes d4spin { to { transform: rotate(360deg); } }
      #d4-boot h1 { font-size: 1.15rem; margin: 0 0 0.4rem; font-weight: 700; }
      #d4-boot p { margin: 0 auto; max-width: 18rem; font-size: 0.9rem; color: #94a3b8; }
      #d4-boot button {
        margin-top: 1.1rem; border: 0; border-radius: 0.75rem;
        background: #2563eb; color: #fff; font-weight: 600;
        padding: 0.7rem 1.25rem; display: none;
      }
      #d4-boot.show-retry button { display: inline-block; }
    </style>
  </head>
  <body>
    <div id="d4-boot" role="status">
      <div>
        <div class="mark">D4</div>
        <div class="spin"></div>
        <h1>Loading D4EXAM</h1>
        <p>Starting secure examination workspace…</p>
        <button type="button" id="d4-retry">Try again</button>
      </div>
    </div>
    <div id="root"></div>
    <script>
      setTimeout(function () {
        var b = document.getElementById("d4-boot");
        if (b && b.style.display !== "none") b.classList.add("show-retry");
      }, 15000);
      document.getElementById("d4-retry").onclick = function () { location.reload(); };
    </script>
    <script type="module" src="./assets/capacitor-app.js"></script>
  </body>
</html>
`;

fs.writeFileSync(path.join(dist, "index.html"), html, "utf8");

const offlinePath = path.join(dist, "offline.html");
if (fs.existsSync(offlinePath)) {
  let offline = fs.readFileSync(offlinePath, "utf8");
  offline = offline.replace(/https:\/\/d4exam-platform\.vercel\.app\/?/g, "./");
  offline = offline.replace(/window\.location\.replace\(\s*LIVE[^)]*\)/g, "window.location.reload()");
  offline = offline.replace(/window\.location\.href\s*=\s*LIVE/g, "window.location.reload()");
  fs.writeFileSync(offlinePath, offline, "utf8");
}

console.log("[prepare-capacitor-dist] SPA shell ready (no Vercel).");
console.log("  assets:", fs.readdirSync(path.join(dist, "assets")).length, "files");
