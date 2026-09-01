/**
 * Prepare dist/ for Capacitor Android SPA shell (no Vercel).
 * 1) Scan server modules and write a full stub map
 * 2) Build client SPA with vite.capacitor.config.ts
 * 3) Write dist/index.html
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const distCap = path.join(root, "dist-capacitor");
const stubDir = path.join(root, "scripts", ".cap-stubs");

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "dist" || name === "android") continue;
      walk(p, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

function collectExportNames(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const names = new Set();
  const re =
    /export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)|export\s+const\s+([A-Za-z0-9_]+)|export\s+{\s*([^}]+)\s*}/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[1]) names.add(m[1]);
    if (m[2]) names.add(m[2]);
    if (m[3]) {
      for (const part of m[3].split(",")) {
        const bit = part.trim().split(/\s+as\s+/).pop().trim();
        if (bit && /^[A-Za-z_][A-Za-z0-9_]*$/.test(bit)) names.add(bit);
      }
    }
  }
  return [...names];
}

function writeStubs() {
  fs.rmSync(stubDir, { recursive: true, force: true });
  fs.mkdirSync(stubDir, { recursive: true });

  const srcFiles = walk(path.join(root, "src"));
  const serverLike = srcFiles.filter(
    (f) =>
      /\.server\.[cm]?[jt]sx?$/.test(f) ||
      /\.functions\.[cm]?[jt]sx?$/.test(f) ||
      /server\.ts$/.test(f),
  );

  const allNames = new Set([
    "getStartContext",
    "getSchoolDashboardCounts",
    "sendTestNotificationToSelf",
    "getMyStudentContext",
    "createServerFn",
    "createMiddleware",
    "getCookie",
    "setCookie",
    "getRequest",
    "getWebRequest",
    "getResponse",
    "createStartHandler",
  ]);

  for (const f of serverLike) {
    for (const n of collectExportNames(f)) allNames.add(n);
  }

  const uniqueLines = [
    "/* auto-generated capacitor server stubs */",
    "const _noop = async () => null;",
    "export const createServerFn = () => {",
    "  const f = async () => null;",
    "  return Object.assign(f, { url: '', method() { return this; }, handler() { return this; }, inputValidator() { return this; }, middleware() { return this; } });",
    "};",
    "export const createMiddleware = () => ({ server: (h) => h });",
    "export const createStartHandler = () => () => {};",
    "export const getCookie = () => undefined;",
    "export const setCookie = () => {};",
    "export const getRequest = () => undefined;",
    "export const getWebRequest = () => undefined;",
    "export const getResponse = () => undefined;",
    "export const getStartContext = () => ({});",
    "export default {};",
  ];
  const reserved = new Set([
    "createServerFn",
    "createMiddleware",
    "createStartHandler",
    "getCookie",
    "setCookie",
    "getRequest",
    "getWebRequest",
    "getResponse",
    "getStartContext",
    "default",
  ]);
  for (const n of [...allNames].sort()) {
    if (reserved.has(n)) continue;
    uniqueLines.push(`export const ${n} = _noop;`);
  }

  const stubFile = path.join(stubDir, "server-shim.js");
  fs.writeFileSync(stubFile, uniqueLines.join("\n") + "\n", "utf8");

  const nodeStub = path.join(stubDir, "node-shim.js");
  fs.writeFileSync(
    nodeStub,
    [
      "export default {};",
      "export const createHash = () => ({ update: () => ({ digest: () => '' }) });",
      "export const randomBytes = () => '';",
      "export const AsyncLocalStorage = class { run(_, f) { return f(); } getStore() { return undefined; } };",
      "export class Readable { static from() { return { pipe() {} }; } }",
      "export class Transform {}",
      "export class PassThrough {}",
    ].join("\n") + "\n",
    "utf8",
  );

  console.log(
    "[prepare-capacitor-dist] Generated stubs for",
    allNames.size,
    "exports from",
    serverLike.length,
    "server files",
  );
  return { stubFile, nodeStub };
}

const { stubFile, nodeStub } = writeStubs();

fs.writeFileSync(
  path.join(stubDir, "paths.json"),
  JSON.stringify({ stubFile, nodeStub, root }),
  "utf8",
);

console.log("[prepare-capacitor-dist] Building Capacitor SPA (client-only)\u2026");
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
      D4_CAP_STUB: stubFile,
      D4_CAP_NODE_STUB: nodeStub,
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

// Copy public/ recursively so bundled offline assets (MediaPipe wasm + model,
// icons, offline.html, service worker) ship inside the native app.
const publicDir = path.join(root, "public");
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    const s = path.join(from, name);
    const d = path.join(to, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
if (fs.existsSync(publicDir)) copyDir(publicDir, dist);

const mpModel = path.join(dist, "mediapipe", "models", "blaze_face_short_range.tflite");
const mpWasm = path.join(dist, "mediapipe", "wasm", "vision_wasm_internal.wasm");
if (!fs.existsSync(mpModel) || !fs.existsSync(mpWasm)) {
  console.error(
    "FATAL: bundled MediaPipe face-detection assets missing under public/mediapipe — offline face monitoring would break.",
  );
  process.exit(1);
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
        <p>Starting secure examination workspace\u2026</p>
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
