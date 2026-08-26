/**
 * Capacitor Android SPA build — client only, no Nitro SSR, no Vercel shell.
 * Stubs TanStack Start server entry points that normal Vite cannot resolve.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/** Stub server-only / Node-only modules so the SPA can bundle. */
function capacitorServerStubs(): Plugin {
  const stub =
    "export default {};\n" +
    "export const createServerFn = () => {\n" +
    "  const fn = async () => { throw new Error('This action requires an internet connection'); };\n" +
    "  return Object.assign(fn, {\n" +
    "    url: '',\n" +
    "    method: () => fn,\n" +
    "    handler: () => fn,\n" +
    "    inputValidator: () => fn,\n" +
    "    middleware: () => fn,\n" +
    "  });\n" +
    "};\n" +
    "export const createMiddleware = () => ({ server: (h) => h });\n" +
    "export const createStartHandler = () => () => {};\n" +
    "export const getCookie = () => undefined;\n" +
    "export const setCookie = () => {};\n" +
    "export const getRequest = () => undefined;\n" +
    "export const getWebRequest = () => undefined;\n" +
    "export const getResponse = () => undefined;\n";

  const nodeStub =
    "export default {};\n" +
    "export const createHash = () => ({ update: () => ({ digest: () => '' }) });\n" +
    "export const randomBytes = () => '';\n" +
    "export const AsyncLocalStorage = class { run(_, f) { return f(); } getStore() { return undefined; } };\n" +
    "export class Readable { static from() { return { pipe() {} }; } }\n" +
    "export class Transform {}\n" +
    "export class PassThrough {}\n";

  function shouldStub(id: string): boolean {
    if (!id) return false;
    if (id === "#tanstack-start-entry" || id === "#tanstack-router-entry") return true;
    if (id.startsWith("node:")) return true;
    if (id.includes("@tanstack/start-server-core")) return true;
    if (id.includes("@tanstack/start-storage-context")) return true;
    if (id.includes("start-server-functions")) return true;
    if (/\.server(\.[cm]?[jt]sx?)?$/.test(id)) return true;
    if (id.includes("push-send.functions")) return true;
    if (id.includes("@tanstack/react-start/server")) return true;
    if (id.includes("react-start/server")) return true;
    if (id.includes("tanstack-start-entry")) return true;
    return false;
  }

  return {
    name: "capacitor-server-stubs",
    enforce: "pre",
    resolveId(id) {
      if (shouldStub(id)) return "\0cap-stub:" + id;
      return null;
    },
    load(id) {
      if (!id.startsWith("\0cap-stub:")) return null;
      if (id.includes("node:")) return nodeStub;
      return stub;
    },
  };
}

export default defineConfig({
  base: "./",
  root: rootDir,
  plugins: [capacitorServerStubs(), react(), tailwindcss(), tsconfigPaths()],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
    },
    conditions: ["import", "module", "browser", "default"],
    mainFields: ["browser", "module", "main"],
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "import.meta.env.SSR": "false",
  },
  build: {
    outDir: "dist-capacitor",
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    target: "es2020",
    commonjsOptions: { transformMixedEsModules: true },
    rollupOptions: {
      input: path.resolve(rootDir, "src/capacitor-main.tsx"),
      output: {
        entryFileNames: "capacitor-app.js",
        chunkFileNames: "cap-[name]-[hash].js",
        assetFileNames: "cap-[name]-[hash][extname]",
      },
      onwarn(warning, warn) {
        if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
        if (String(warning.message || "").includes("externalized for browser")) return;
        warn(warning);
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-query"],
  },
});
