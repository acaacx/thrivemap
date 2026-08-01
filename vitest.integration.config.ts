import { defineConfig } from "vitest/config";
import path from "node:path";

// Integration tests run against a local `supabase start` stack.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // DB tests mutate shared state; keep them serial.
    fileParallelism: false,
  },
});
