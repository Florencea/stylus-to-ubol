# stylus-to-ubol

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A serverless, pure client-side one-way compiler converting Stylus export JSON into uBlock Origin Lite (uBOL) configuration JSON (`my-ubol-settings.json`).

**Live Deployment**: [https://florencea.github.io/stylus-to-ubol/](https://florencea.github.io/stylus-to-ubol/)

## Core Deliverables

1. **Unidirectional Compilation Pipeline**
   - Stylus JSON export is the sole Single Source of Truth (SSOT).
   - Strictly one-way conversion: Stylus JSON compiles directly to uBOL JSON configuration backups (`my-ubol-settings.json`).
   - Zero intermediate `.css` file persistence on disk; all AST parsing and transformations run in-memory via `css-tree` subpath imports (`parser`, `generator`, `walker`) with fail-fast `zod` runtime contracts.

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

Validated at runtime by `UbolConfigSchema` (`zod`):

```js
export const UbolConfigSchema = z.looseObject({
  customFilters: z.array(z.tuple([z.string(), z.array(z.string())])),
  sandboxFilters: z.array(z.string()),
});
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
├── scripts/
│   ├── build.js           # Rolldown JS-only bundler & inline CSS HTML build
│   └── serve.js           # Node built-in static server (preview, watch, E2E)
├── src/
│   ├── compiler.js        # Unified in-memory compiler engine & Zod contracts
│   ├── main.js            # UI event controller, DOM guards & download trigger
│   ├── storage.js         # Browser localStorage persistence & Zod validation
│   └── style.css          # Minimalist styles (inlined into dist/index.html)
├── test/
│   ├── compiler.test.js   # node:test unit tests for compiler & Zod contracts
│   ├── storage.test.js    # node:test unit tests for storage persistence
│   └── e2e/
│       └── app.test.js    # Native Playwright Chromium E2E tests against dist/
├── .npmrc                 # Strict npm supply-chain & lockfile configuration
├── .prettierignore        # Prettier ignore patterns
├── eslint.config.js       # Strict ESLint 10 flat configuration
├── index.html             # Client-side interface template
├── package-lock.json      # Exact npm dependency lockfile
└── package.json           # Shared scripts and pinned dependencies
```

## Quick Start

### Prerequisites

- Node.js Active LTS (validated against dependency `engines` ranges via `.npmrc` `engine-strict=true`)
- `npm`

```bash
npm ci
npm run dev
```

## Verification Gates

The project enforces a strict `.npmrc` policy (`ignore-scripts=true`, `save-exact=true`, `install-strategy=linked`, `strict-peer-deps=true`, `engine-strict=true`) and provides shared human/agent verification workflows:

### Inner Loop: Static & Unit Checks

```bash
npm run lint && npm run format:check
npm run test:unit
```

Executes ESLint 10 (`--max-warnings 0`, `noInlineConfig: true`), Prettier formatting check, and Node built-in `node:test` unit tests.

### Complete Verification Gate (`verify`)

```bash
npm run verify
```

Executes:

1. `lint` (ESLint 10, `--max-warnings 0`)
2. `format:check` (Prettier formatting check)
3. `build` (`rolldown` JS bundle + inlined CSS HTML output in `dist/`)
4. `npm test` (`node:test` unit suite + Playwright Chromium E2E tests against `dist/`)

### Deployment Workflow

- **GitHub Pages Deployment (`.github/workflows/deploy.yml`)**: Runs on `push` to `main` or manual `workflow_dispatch` on `ubuntu-24.04` with `actions/setup-node` `node-version: "lts/*"`. Performs `npm ci`, runs `npm run build`, and deploys `dist/` to GitHub Pages.
- **Workflow Syntax Linting**: Validate `.github/workflows/*.yml` locally with `npm run lint:ci` (`actionlint`) before staging changes.

## Available Commands & Scripts

| Script                 | Description                                                        |
| :--------------------- | :----------------------------------------------------------------- |
| `npm run dev`          | Build, watch `src/` and `index.html`, and serve `dist/` locally    |
| `npm run build`        | Bundle JS with `rolldown` and emit static `dist/` with inlined CSS |
| `npm run preview`      | Serve built `dist/` locally via Node HTTP server                   |
| `npm run lint`         | Run strict ESLint checks (`--max-warnings 0`)                      |
| `npm run lint:fix`     | Run ESLint auto-fix                                                |
| `npm run lint:ci`      | Check GitHub Actions workflows with `actionlint`                   |
| `npm run format`       | Format files with Prettier                                         |
| `npm run format:check` | Verify formatting with Prettier                                    |
| `npm test`             | Run all unit and Playwright E2E test suites                        |
| `npm run test:unit`    | Run `node:test` unit tests                                         |
| `npm run test:e2e`     | Run native Playwright Chromium E2E tests against `dist/`           |
| `npm run test:setup`   | Install Playwright Chromium browser binaries                       |
| `npm run verify`       | Complete verification gate (lint, format, build, unit & E2E tests) |

## Guidelines

For strict agent development guidelines, architectural rules, and verification standards, see [AGENTS.md](AGENTS.md).
