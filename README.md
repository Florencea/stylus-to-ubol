# stylus-to-ubol

[![CI](https://github.com/Florencea/stylus-to-ubol/actions/workflows/ci.yml/badge.svg)](https://github.com/Florencea/vite-start-antd/actions/workflows/ci.yml)
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

### 1. Data Contract (Zod Schema)

```ts
import { z } from "zod";

export const UbolConfigSchema = z.object({
  version: z.string(),
  filteringModes: z.object({
    none: z.array(z.string()).default([]),
    basic: z.array(z.string()).default([]),
    optimal: z.array(z.string()).default([]),
    complete: z.array(z.string()).default([]),
  }),
  customFilters: z.array(
    z.tuple([z.string().min(1), z.array(z.string().min(1))]),
  ),
  sandboxFilters: z.array(z.string()),
});

export type UbolConfig = z.infer<typeof UbolConfigSchema>;
```

- **`customFilters`**: Pure cosmetic hide rules, grouped by hostname: `[domain, [selector1, selector2, ...]]`.
- **`sandboxFilters`**: Style injection rules containing `:style(...)`, formatted as standard uBO filter strings: `domain##selector:style(...)`.
- **Global Generic Rules**: Rules with empty domains or `*` use `*` domain in `customFilters` and `*##` prefix in `sandboxFilters`.

### 2. Project Structure

```text
stylus-to-ubol/
├── index.html             # Client-side interface
├── src/
│   ├── compiler.ts        # Unified in-memory compiler engine & statistics
│   ├── main.ts            # UI event controller & download trigger
│   └── style.css          # Minimalist styles
├── tests/
│   ├── compiler.test.ts   # Vitest unit tests for compiler engine
│   └── e2e/
│       └── app.spec.ts    # Playwright E2E integration tests
├── tsconfig.json          # Strict TypeScript configuration
└── vite.config.ts         # Vite configuration
```

## Getting Started

### Prerequisites

- Node.js `24.x` (LTS)

### Installation

```bash
npm ci
```

### Development Server

```bash
npm run dev
```

### Verification & Testing

```bash
npm run check
```
