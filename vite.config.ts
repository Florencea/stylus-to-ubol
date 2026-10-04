import { defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

export default defineConfig({
  base: "./",
  run: {
    cache: {
      scripts: true,
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "css-tree",
              test: /node_modules\/css-tree/,
            },
          ],
        },
      },
    },
  },
  lint: {
    ignorePatterns: [
      "dist/**",
      ".cache/**",
      ".vitest/**",
      "test-results/**",
      "playwright-report/**",
      "blob-report/**",
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    categories: {
      correctness: "error",
      suspicious: "error",
      perf: "error",
    },
    plugins: ["unicorn", "typescript", "oxc", "vitest", "promise"],
  },
  fmt: {
    ignorePatterns: [
      "dist/**",
      ".cache/**",
      ".vitest/**",
      "test-results/**",
      "playwright-report/**",
      "blob-report/**",
    ],
    sortPackageJson: true,
  },
  test: {
    allowOnly: !process.env.CI,
    silent: "passed-only",
    projects: [
      {
        test: {
          name: "unit",
          include: ["test/**/*.{test,spec}.ts"],
          exclude: ["test/e2e/**"],
        },
      },
      {
        test: {
          name: "e2e",
          include: ["test/e2e/**/*.{test,spec}.ts"],
          browser: {
            provider: playwright(),
            enabled: true,
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
