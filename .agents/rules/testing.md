---
trigger: glob
globs: "test/**, **/*.test.ts"
description: Testing standards for Vitest dual-project architecture (unit & browser e2e).
---

# Testing Standards & Guidelines

Standards for unit and browser end-to-end testing across this codebase.

## 1. Dual-Project Testing Architecture

All tests execute via unified Vite+ Vitest commands:

- **Unit Tests (`vpr agent:test:unit`)**:
  - Target: `test/compiler.test.ts` via `--project unit`.
  - Focus: In-memory AST manipulation, rules splitting, CSS declaration serialization, and syntax parsing.
- **E2E Browser Tests (`vpr agent:test:e2e`)**:
  - Target: `test/e2e/**/*.test.ts` via `--project e2e`.
  - Focus: Headless Chromium user journeys, drag-and-drop file inputs, UI statistics rendering, and export downloads.

## 2. Invariants & Assertions

- **No Standalone Playwright Runner**: Never maintain a standalone `playwright.config.ts` or spin up separate preview servers for tests. Vitest Browser Mode is the sole SSOT test runner.
- **Assertion Narrowing**: Use `assert` from `vite-plus/test` to narrow AST types and avoid conditional `expect` calls (`no-conditional-expect`).
- **Clean Execution**: Console logs are muted for passed tests (`silent: "passed-only"`).
