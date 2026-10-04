# stylus-to-ubol

[![CI](https://github.com/Florencea/stylus-to-ubol/actions/workflows/ci.yml/badge.svg)](https://github.com/Florencea/stylus-to-ubol/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A serverless, pure client-side one-way compiler converting Stylus export JSON into uBlock Origin Lite (uBOL) configuration JSON (`my-ubol-settings.json`).

**Live Deployment**: [https://florencea.github.io/stylus-to-ubol/](https://florencea.github.io/stylus-to-ubol/)

## Core Deliverables

1. **Unidirectional Compilation Pipeline**
   - Stylus JSON export is the sole Single Source of Truth (SSOT).
   - Strictly one-way conversion: Stylus JSON compiles directly to uBOL JSON configuration backups (`my-ubol-settings.json`).
   - Zero intermediate `.css` file persistence on disk; all AST parsing and transformations run in-memory via `css-tree`.

2. **Pure Static Client-Side Interface (`index.html`)**
   - Clean, intuitive centered card interface for uploading `stylus.json` via file selection or drag-and-drop.
   - Optional base uBlock configuration upload (`ublock-config.json` or `my-ubol-settings.json`) allowing users to preserve custom settings while replacing filter rules.
   - Instant in-browser AST transformation and rule compilation.
   - Real-time conversion statistics display:
     - **Target Domains**: Unique hostnames targeted by the rules.
     - **Hide Rules**: Pure cosmetic hide selectors (`display: none !important`).
     - **Style Rules**: Declarative style injection rules (`:style(...)`).
     - **Base Settings**: Status indicator reflecting merged custom config or default configuration.
   - Single one-click download button for `my-ubol-settings.json`.
   - Explicit error alert panel showing actionable syntax and structure details if an invalid file is uploaded.

## Architecture & Specifications

### 1. Data Contract

```ts
export interface UbolConfig {
  customFilters: [string, string[]][];
  sandboxFilters: string[];
  [key: string]: unknown;
}
```

- **`customFilters`**: Pure cosmetic hide rules, grouped by hostname: `[domain, [selector1, selector2, ...]]`.
- **`sandboxFilters`**: Style injection rules containing `:style(...)`, formatted as standard uBO filter strings: `domain##selector:style(...)`.
- **Global Generic Rules**: Rules with empty domains or `*` use `*` domain in `customFilters` and `*##` prefix in `sandboxFilters`.

### 2. Project Structure

```text
stylus-to-ubol/
├── .agents/
│   └── rules/             # Domain-specific modular rules (compiler, testing, CI)
├── src/
│   ├── compiler.ts        # Unified in-memory compiler engine & statistics
│   ├── main.ts            # UI event controller & download trigger
│   └── style.css          # Minimalist styles
├── test/
│   ├── compiler.test.ts   # Vitest unit tests for compiler engine
│   └── e2e/
│       └── app.test.ts    # Vitest browser-mode (Chromium) E2E integration tests
├── index.html             # Client-side interface
├── package.json           # Scripts, catalog dependencies, and engine configs
├── pnpm-workspace.yaml    # Catalog dependency definitions
├── tsconfig.json          # Strict TypeScript configuration
└── vite.config.ts         # Consolidated Vite+ configuration (lint, fmt, test, build)
```

## Getting Started

### Prerequisites

- Node.js `24.x` (LTS)
- Vite+ (`vp` / `vpr`)

### Installation

```bash
vp install
```

### Development Server

```bash
vp dev
```

### Production Build

```bash
vp build
```

### Verification & Testing

```bash
# Run full verification gate (Oxfmt, Oxlint, deadcode check, unit tests, build, E2E tests)
vpr verify

# Or individual tasks
vp check              # Format & lint checks via Oxlint & Oxfmt
vpr typecheck         # TypeScript strict check
vpr agent:test:unit   # In-memory unit tests
vpr agent:test:e2e    # Vitest browser Chromium E2E tests
```
