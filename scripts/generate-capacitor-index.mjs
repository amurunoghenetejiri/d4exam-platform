/**
 * TanStack Start / Nitro does not emit a static index.html (SSR-only HTML).
 * Capacitor needs a real entry that loads the client bundle from /assets.
 * This script builds a centered boot screen + module entry from the built assets.
 */
import fs from "node:fs";
import path from "node:path";

const dist = path.resolve("dist");
const assetsDir = path.join(dist, "assets");

if (!fs.existsSync(assetsDir)) {
  console.error("FATAL: dist/assets missing — run build first");
  process.exit(1);
}

const files = fs.readdirSync(assetsDir);
// Main client entry is the large assets/index-*.js (Start client hydrate)
const indexJs = files
  .filter((f) => /^index-[A-Za-z0-9_-]+\.js$/.test(f))
  .sort((a, b) => fs.statSync(path.join(assetsDir, b)).size - fs.statSync(path.join(assetsDir, a)).size)[0];
const stylesCss = files.find((f) => /^styles-[A-Za-z0-9_-]+\.css$/.test(f));

if (!indexJs) {
  console.error("FATAL: no assets/index-*.js found");
  process.exit(1);
}

const cssLink = stylesCss
  ? `<link rel="stylesheet" href="./assets/${stylesCss}" />`
  : "";

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0b1b3a" />
    <meta name="color-scheme" content="dark" />
    <title>D4EXAM</title>
    ${cssLink}
    <style>
      html, body {
        margin: 0;
        min-height: 100%;
        background: #0b1b3a;
      }
      #d4-boot {
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: grid;
        place-items: center;
        background: #0b1b3a;
        color: #e2e8f0;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        text-align: center;
        padding: max(1rem, env(safe-area-inset-top)) 1.25rem max(1rem, env(safe-area-inset-bottom));
      }
      #d4-boot .mark {
        width: 72px; height: 72px; margin: 0 auto 1rem;
        border-radius: 18px; background: #1e3a5f;
        display: grid; place-items: center;
        font-weight: 800; font-size: 1.25rem; color: #93c5fd;
      }
      #d4-boot .spin {
        width: 36px; height: 36px; margin: 0 auto 1rem;
        border: 3px solid #1e3a5f; border-top-color: #3b82f6;
        border-radius: 50%; animation: d4spin 0.8s linear infinite;
      }
      @keyframes d4spin { to { transform: rotate(360deg); } }
      #d4-boot h1 { font-size: 1.15rem; margin: 0 0 0.4rem; font-weight: 700; }
      #d4-boot p { margin: 0; font-size: 0.9rem; color: #94a3b8; max-width: 16rem; line-height: 1.4; }
      #d4-boot button {
        margin-top: 1.25rem; border: 0; border-radius: 0.75rem;
        background: #2563eb; color: #fff; font-weight: 600;
        padding: 0.7rem 1.25rem; font-size: 0.9rem; cursor: pointer;
        display: none;
      }
      #d4-boot.show-retry button { display: inline-block; }
      html.d4-exam-immersive, body.d4-exam-immersive {
        overflow: hidden !important;
      }
    </style>
  </head>
  <body>
    <div id="d4-boot" role="status" aria-live="polite">
      <div>
        <div class="mark">D4</div>
        <div class="spin" aria-hidden="true"></div>
        <h1>Loading D4EXAM</h1>
        <p>Preparing your secure examination workspace…</p>
        <button type="button" id="d4-retry">Try again</button>
      </div>
    </div>
    <script>
      (function () {
        // Minimal Start hydration stubs so client entry can boot without SSR stream
        self.$_TSR = self.$_TSR || {
          hydrated: false,
          streamEnded: true,
          initialized: true,
          buffer: [],
          h: function () { this.hydrated = true; this.c && this.c(); },
          e: function () { this.streamEnded = true; this.c && this.c(); },
          c: function () {},
          p: function (fn) { try { fn(); } catch (e) {} }
        };
        function hideBoot() {
          var el = document.getElementById("d4-boot");
          if (el) el.style.display = "none";
        }
        // Hide boot once React has painted something real
        var obs = new MutationObserver(function () {
          var boot = document.getElementById("d4-boot");
          if (!boot) return;
          // If router mounted content outside boot, hide loader
          var kids = document.body.children;
          if (kids.length > 1) hideBoot();
        });
        try { obs.observe(document.body, { childList: true, subtree: true }); } catch (e) {}
        // Safety: if still stuck after 12s, show retry
        setTimeout(function () {
          var boot = document.getElementById("d4-boot");
          if (boot && boot.style.display !== "none") {
            boot.classList.add("show-retry");
          }
        }, 12000);
        var btn = document.getElementById("d4-retry");
        if (btn) btn.onclick = function () { location.reload(); };
        // Also hide after load settles
        window.addEventListener("load", function () {
          setTimeout(hideBoot, 2500);
        });
      })();
    </script>
    <script type="module" src="./assets/${indexJs}"></script>
  </body>
</html>
`;

fs.writeFileSync(path.join(dist, "index.html"), html, "utf8");
console.log("Generated dist/index.html → entry", indexJs, "css", stylesCss || "(none)");
