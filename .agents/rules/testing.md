---
trigger: glob
globs: "test/**, **/*.test.js"
description: Testing standards for compiler AST assertions, Zod contract tests, and Chromium E2E workflows.
---

# Testing Standards & Guidelines

Testing standards tailored specifically for the `stylus-to-ubol` test suite.

## 1. Unit Tests (`test/compiler.test.js`, `test/storage.test.js`)

- **Node Built-In Runner**: Use `node:test` (`describe`, `it`, `beforeEach`, `afterEach`) and `node:assert/strict`.
- **AST & Fail-Fast Zod Coverage**: Assert AST node types before inspecting children, and explicitly verify that invalid argument types throw `ZodError` at public API boundaries.

## 2. Browser E2E Tests (`test/e2e/app.test.js`)

- **Production Bundle Verification**: Start a local static server for `dist/` on an ephemeral port (`port: 0`) via `startStaticServer` from `scripts/serve.js`, then drive headless Chromium via native `playwright`.
- **Real File Upload & Storage Isolation**: Clear `localStorage` and reload before each test, use Playwright `setInputFiles` for realistic file upload flows, and close browser and server handles cleanly in `after`.
