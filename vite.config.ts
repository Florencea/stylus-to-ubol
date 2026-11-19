import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  test: {
    allowOnly: (process.env.CI ?? "") === "",
    silent: "passed-only",
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["test/**/*.{test,spec}.ts"],
          exclude: ["test/e2e/**"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "e2e",
          include: ["test/e2e/**/*.{test,spec}.ts"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
