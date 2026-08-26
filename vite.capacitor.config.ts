/**
 * Standalone Vite build for the Capacitor Android SPA shell.
 * Produces a client-only bundle (no Nitro SSR) so the APK does not need Vercel.
 */
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: "dist-capacitor",
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: path.resolve(__dirname, "src/capacitor-main.tsx"),
      output: {
        entryFileNames: "capacitor-app.js",
        chunkFileNames: "cap-[name]-[hash].js",
        assetFileNames: "cap-[name]-[hash][extname]",
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-query"],
  },
});
