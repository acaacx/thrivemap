import { defineConfig } from "vitest/config";
import fs from "node:fs";
import path from "node:path";

// Server modules validate env at import; feed them .env.local like the dev
// server does. Simple KEY=VALUE lines only — that's all the file contains.
function loadLocalEnv(): Record<string, string> {
  const file = path.resolve(__dirname, ".env.local");
  if (!fs.existsSync(file)) return {};
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (match) env[match[1]] = match[2];
  }
  return env;
}

// Integration tests run against a local `supabase start` stack.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Server modules guard with `import "server-only"`, which throws
      // outside a React Server environment; stub it for node tests.
      "server-only": path.resolve(
        __dirname,
        "./tests/integration/helpers/server-only-stub.ts",
      ),
    },
  },
  test: {
    environment: "node",
    env: loadLocalEnv(),
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // DB tests mutate shared state; keep them serial.
    fileParallelism: false,
  },
});
