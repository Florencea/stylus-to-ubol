# stylus-to-ubol

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A serverless, pure client-side one-way compiler converting Stylus export JSON into uBlock Origin Lite (uBOL) configuration JSON (`my-ubol-settings.json`).

**Live Deployment**: [https://florencea.github.io/stylus-to-ubol/](https://florencea.github.io/stylus-to-ubol/)

## Core Deliverables

1. **Unidirectional Compilation Pipeline**
   - Stylus JSON export is the sole Single Source of Truth (SSOT).
   - Strictly one-way conversion: Stylus JSON compiles directly to uBOL JSON configuration backups (`my-ubol-settings.json`).
   - Zero intermediate `.css` file persistence on disk; all AST parsing and transformations run in-memory via `css-tree`.

2. **Static Client-Side Interface (`index.html`)**
   - Centered card interface for uploading `stylus.json` via file selection or drag-and-drop.
   - Optional base uBlock configuration upload (`ublock-config.json` or `my-ubol-settings.json`) with browser `localStorage` caching, allowing users to preserve custom settings while replacing filter rules.
   - Instant in-browser AST transformation and rule compilation.
   - Real-time conversion statistics display:
     - **Target Domains**: Unique hostnames targeted by the rules.
     - **Hide Rules**: Pure cosmetic hide selectors (`display: none !important`).
     - **Style Rules**: Declarative style injection rules (`:style(...)`).
     - **Base Settings**: Status indicator reflecting default, cached, or uploaded configuration.
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
│   └── rules/             # Domain-specific modular rules (compiler, testing)
├── .github/
│   └── workflows/
│       └── deploy.yml     # GitHub Pages deployment workflow
├── src/
│   ├── compiler.ts        # Unified in-memory compiler engine & statistics
│   ├── main.ts            # UI event controller & download trigger
│   ├── storage.ts         # Browser localStorage persistence & Zod validation
│   └── style.css          # Minimalist styles
├── test/
│   ├── compiler.test.ts   # Vitest unit tests for compiler engine
│   ├── storage.test.ts    # Vitest unit tests for storage persistence
│   └── e2e/
│       └── app.test.ts    # Vitest browser-mode (Chromium) E2E integration tests
├── .npmrc                 # Strict npm supply-chain & lockfile configuration
├── .prettierignore        # Prettier ignore patterns
├── eslint.config.ts       # Strict ESLint 10 flat configuration
├── index.html             # Client-side interface
├── package-lock.json      # Exact npm dependency lockfile
├── package.json           # Shared scripts and pinned dependencies
├── prettier.config.ts     # Prettier configuration with packagejson sorting
├── tsconfig.json          # Project references TypeScript configuration
└── vite.config.ts         # Vite build & Vitest dual-project test configuration
```

## Quick Start

### Prerequisites

- Node.js Active LTS (validated against dependency `engines` ranges via `.npmrc` `engine-strict=true`, currently `^22.12.0 || ^24.0.0 || >=26.0.0`)
- `npm`

```bash
npm ci
npm run dev
```

## Verification Gates

The project enforces a strict `.npmrc` policy (`ignore-scripts=true`, `save-exact=true`, `install-strategy=linked`, `strict-peer-deps=true`, `engine-strict=true`) and provides shared human/agent verification workflows:

### Inner Loop: Static & Unit Checks

```bash
npm run typecheck && npm run lint && npm run format:check
npm run test:unit
```

Executes TypeScript 6 `tsc -b --pretty false`, ESLint (`strictTypeChecked` & `stylisticTypeChecked`, `--max-warnings 0`), Prettier formatting check, and Vitest unit tests.

### Complete Verification Gate (`verify`)

```bash
npm run verify
```

Executes:

1. `typecheck` (TypeScript 6 `tsc -b --pretty false`)
2. `lint` (ESLint `strictTypeChecked` + `stylisticTypeChecked`, `--max-warnings 0`)
3. `format:check` (Prettier formatting check)
4. `build` (Vite production bundle verification)
5. `npm test` (Unit & Playwright Chromium Browser tests)

### Deployment Workflow

- **GitHub Pages Deployment (`.github/workflows/deploy.yml`)**: Runs on `push` to `main` or manual `workflow_dispatch` on `ubuntu-24.04` with `actions/setup-node` `node-version: "lts/*"`. Performs `npm ci`, runs `npm run build`, and deploys `dist/` to GitHub Pages.
- **Workflow Syntax Linting**: Validate `.github/workflows/*.yml` locally with `npm run lint:ci` (`actionlint`) before staging changes.

## Available Commands & Scripts

| Script                 | Description                                                        |
| :--------------------- | :----------------------------------------------------------------- |
| `npm run dev`          | Start local Vite development server                                |
| `npm run build`        | Build production bundle with Vite                                  |
| `npm run preview`      | Preview production build locally                                   |
| `npm run typecheck`    | Run strict TypeScript 6 project build checks (`tsc -b`)            |
| `npm run lint`         | Run strict ESLint checks (`--max-warnings 0`)                      |
| `npm run lint:fix`     | Run ESLint auto-fix                                                |
| `npm run lint:ci`      | Check GitHub Actions workflows with `actionlint`                   |
| `npm run format`       | Format files with Prettier                                         |
| `npm run format:check` | Verify formatting with Prettier                                    |
| `npm test`             | Run all Vitest projects (`unit` and `e2e`)                         |
| `npm run test:unit`    | Run Vitest unit test project                                       |
| `npm run test:e2e`     | Run Vitest Browser Mode (`@vitest/browser-playwright`) E2E project |
| `npm run test:setup`   | Install Playwright Chromium browser binaries                       |
| `npm run verify`       | Complete verification gate (typecheck, lint, format, build, test)  |

## Guidelines

For strict agent development guidelines, architectural rules, and verification standards, see [AGENTS.md](AGENTS.md).
