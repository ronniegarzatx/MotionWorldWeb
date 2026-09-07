import { defineConfig } from "vite";

// Static SPA. No backend, no proxy, no server-side code.
// base "./" keeps the build portable to any static host or a localhost copy.
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
