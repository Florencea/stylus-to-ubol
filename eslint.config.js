import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";

export default defineConfig([
  globalIgnores([
    "dist",
    ".cache",
    "test-results",
    "playwright-report",
    "blob-report",
  ]),
  {
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: "error",
    },
  },
  {
    files: ["**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
    },
    rules: {
      "array-callback-return": "error",
      "consistent-return": "error",
      eqeqeq: ["error", "always"],
      "no-implicit-coercion": "error",
      "no-shadow": "error",
      "no-var": "error",
      "prefer-const": "error",
    },
  },
  {
    files: ["src/compiler.js"],
    languageOptions: {
      globals: globals.es2023,
    },
  },
  {
    files: ["src/main.js", "src/storage.js"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ["scripts/**/*.js", "test/**/*.js", "*.config.js"],
    ignores: ["test/e2e/**"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["test/e2e/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
]);
