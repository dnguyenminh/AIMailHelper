// vitest.config.ts — Vitest 2 + jsdom (TDD §12.1); chrome mock nạp qua setupFiles (§12.2).
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: false,
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"]
  }
});
