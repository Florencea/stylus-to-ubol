---
trigger: glob
globs: "test/**, **/*.test.ts"
description: Testing standards for compiler AST assertions and in-memory browser E2E workflows.
---

# Testing Standards & Guidelines

Testing standards tailored specifically for the `stylus-to-ubol` test suite.

## 1. Compiler Unit Tests (`test/compiler.test.ts`)

- **Strict AST Type Narrowing**: Use `assert` from `vite-plus/test` to narrow AST node types (e.g. `assert(ast.type === "StyleSheet")`) before inspecting children.
- **No Conditional Expects**: Never wrap assertions inside `if` blocks or optional chaining guards; rely strictly on `assert` narrowing to ensure strict TypeScript inference and satisfy `oxlint` rules (`no-conditional-expect`).

## 2. In-Memory Browser E2E Tests (`test/e2e/app.test.ts`)

- **DOM Mounting**: Mount clean DOM per test run using `DOMParser` on `index.html?raw`, inject into `document.body`, and initialize via `setupConverterApp()`.
- **Synthetic File Uploads**: Mock file inputs by configuring `File` objects directly onto `HTMLInputElement.files` and dispatching synthetic `change` events.
- **Asynchronous Tick**: Await `setTimeout(..., 50)` or microtasks to allow client-side `file.text()` promise chains to resolve before verifying UI state.
