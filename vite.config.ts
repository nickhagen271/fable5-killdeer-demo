import { defineConfig } from "vite";

export default defineConfig(({ command, isPreview }) => ({
  build: {
    target: "esnext",
    chunkSizeWarningLimit: 4096,
  },
  server: {
    port: 5173,
    strictPort: true,
    // tool-driven file writes are missed by fsevents on this setup; poll so
    // the module graph never serves stale code (cost: dev-only CPU)
    watch: { usePolling: true, interval: 200 },
  },
  esbuild: {
    target: "esnext",
  },
  // GitHub Pages serves from /<repo>/ — see .github/workflows/deploy.yml.
  // Preview shares the built base so `npm run preview` (and the deploy gate)
  // serve the bundle at exactly the path Pages will; dev stays at root.
  base: command === "build" || isPreview === true ? "/fable5-killdeer-demo/" : "/",
}));
