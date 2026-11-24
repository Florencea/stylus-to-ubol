---
trigger: glob
globs: "test/**, **/*.test.js"
description: Testing standards for native CSS parser diagnostics, compiler AST assertions, contract tests, and Chromium E2E workflows.
---

# Testing Standards & Guidelines

Testing standards tailored specifically for the `stylus-to-ubol` test suite.

## 1. Unit Tests (`test/css-parser.test.js`, `test/compiler.test.js`, `test/storage.test.js`)

- **Node Built-In Runner**: Use `node:test` (`describe`, `it`, `beforeEach`, `afterEach`) and `node:assert/strict`.
- **Parser, AST & Fail-Fast Coverage**: Assert AST node types before inspecting children, verify exact `line`/`column`/metadata reporting on `CssParseError`, and explicitly verify that invalid argument types throw `ValidationError` at public API boundaries.

## 2. Browser E2E Tests (`test/e2e/app.test.js`)

- **Direct Static Source Verification**: Start a local static server for `src/` on an ephemeral port (`port: 0`) via `startStaticServer` from `scripts/serve.js`, then drive headless Chromium via native `playwright`.
- **Zero Runtime Errors & Storage Isolation**: Assert zero `pageerror`, `console.error`, and HTTP `>= 400` failures on page load; clear `localStorage` and reload before each test; use Playwright `setInputFiles` for realistic file upload flows (including CSS syntax error rendering); and close browser and server handles cleanly in `after`.
