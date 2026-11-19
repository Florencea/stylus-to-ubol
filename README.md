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
├── package.json           # Scripts, dependencies, and engine constraints
├── prettier.config.ts     # Prettier configuration with packagejson sorting
├── tsconfig.json          # Project references TypeScript configuration
└── vite.config.ts         # Vite build & Vitest dual-project test configuration
```

## Quick Start

### Prerequisites

- Node.js `26.x` (Active LTS)
- `npm`

```bash
npm ci
npm run dev
```

## Verification Gates

The project enforces a strict `.npmrc` policy (`ignore-scripts=true`, `save-exact=true`, `install-strategy=linked`, `strict-peer-deps=true`, `engine-strict=true`) and provides multi-tier verification workflows:

### Inner Loop: Fast Feedback (`check:fast`)

```bash
npm run check:fast
```

Executes `typecheck` (`tsc -b --pretty false`) + `lint` (ESLint `strictTypeChecked` & `stylisticTypeChecked`) + `agent:test:unit` (Vitest unit tests).

### Complete Verification Gate (`verify`)

```bash
npm run verify
```

Executes:

1. `typecheck` (`tsc -b --pretty false`)
2. `lint` (ESLint `strictTypeChecked` + `stylisticTypeChecked`, `--max-warnings 0`)
3. `format:check` (Prettier formatting check)
4. `check:deadcode` (Knip unused exports and dependency check)
5. `vitest run` (Unit & Playwright Chromium Browser tests)
6. `vite build` (Vite production bundle verification)

### Deployment Workflow

- **GitHub Pages Deployment (`.github/workflows/deploy.yml`)**: Runs on `push` to `main` or manual `workflow_dispatch` on `ubuntu-24.04` against `package.json` `engines.node`. Performs `npm ci`, runs `npm run build`, and deploys `dist/` to GitHub Pages.
- **Workflow Syntax Linting**: Validate `.github/workflows/*.yml` locally with `npm run agent:lint:ci` (`actionlint`) before staging changes.

## Available Commands & Scripts

| Script                       | Description                                                             |
| :--------------------------- | :---------------------------------------------------------------------- |
| `npm run dev`                | Start local Vite development server                                     |
| `npm run build`              | Build production bundle with Vite                                       |
| `npm run preview`            | Preview production build locally                                        |
| `npm run typecheck`          | Run strict TypeScript project build checks (`tsc -b --pretty false`)    |
| `npm run lint`               | Run strict ESLint checks (`--max-warnings 0`)                           |
| `npm run lint:fix`           | Run ESLint auto-fix                                                     |
| `npm run format`             | Format files with Prettier                                              |
| `npm run format:check`       | Verify formatting with Prettier                                         |
| `npm test`                   | Run all Vitest projects (`unit` and `e2e`)                              |
| `npm run test:unit`          | Run Vitest unit test project                                            |
| `npm run test:e2e`           | Run Vitest Browser Mode (`@vitest/browser-playwright`) E2E project      |
| `npm run test:setup`         | Install Playwright Chromium browser binaries                            |
| `npm run check:deadcode`     | Run Knip deadcode and unused dependency detection                       |
| `npm run agent:verify:inner` | Inner-loop validation (`typecheck` + `lint`)                            |
| `npm run agent:test:unit`    | Flat TAP output Vitest unit execution without colors                    |
| `npm run agent:test:e2e`     | Flat TAP output Vitest browser E2E execution without colors             |
| `npm run agent:verify:gate`  | Automated verification gate (`agent:verify:unit` + `build` + `e2e`)     |
| `npm run verify`             | Complete verification gate (typecheck, lint, format, knip, test, build) |
| `npm run agent:lint:fix`     | Run ESLint `--fix` and Prettier `--write`                               |
| `npm run agent:lint:ci`      | Check GitHub Actions workflows with `actionlint`                        |

## Guidelines

For strict agent development guidelines, architectural rules, and verification standards, see [AGENTS.md](AGENTS.md).
