import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

export default defineConfig({
  oxc: {
    jsx: { runtime: "automatic" },
  },
  resolve: {
    alias: {
      // Next resolves `server-only` to this no-op under its react-server
      // condition; the package's default entry throws outside that bundle.
      "server-only": fileURLToPath(new URL("node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    passWithNoTests: true,
    env: {
      ...(testDatabaseUrl ? { DATABASE_URL: testDatabaseUrl } : {}),
      APP_URL: "http://localhost:3000",
      EMAIL_FROM: "tracklite@localhost",
      MAILPIT_HOST: "localhost",
      MAILPIT_PORT: "8025",
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          environment: "node",
          fileParallelism: false,
          globalSetup: ["src/test/migrate.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "components",
          include: ["src/**/*.test.tsx"],
          environment: "jsdom",
        },
      },
    ],
  },
});