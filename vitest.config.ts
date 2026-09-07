import { defineConfig } from "vitest/config";

// Most suites are pure and run in Node. The few DOM tests opt in per-file with
//   // @vitest-environment jsdom
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.mjs"],
    clearMocks: true,
  },
});
