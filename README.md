# stylus-to-ubol

A serverless, pure client-side one-way compiler converting Stylus export JSON into uBlock Origin Lite (uBOL) configuration JSON.

**Live Deployment**: [https://florencea.github.io/stylus-to-ubol/](https://florencea.github.io/stylus-to-ubol/)

## Core Deliverables

1. **Unidirectional Compilation Pipeline**
   - Stylus JSON export is the sole Single Source of Truth (SSOT).
   - Strictly one-way conversion: Stylus JSON compiles directly to uBOL JSON configuration backups.
   - Zero intermediate `.css` file persistence on disk; all AST parsing and transformations run in-memory via PostCSS.
   - Generates separated Desktop and Mobile configurations as well as a complete unified configuration.

2. **Pure Static Client-Side Interface (`index.html`)**
   - Clean, intuitive centered card interface for uploading `stylus.json` via file selection or drag-and-drop.
   - Instant in-browser AST transformation and validation using PostCSS and `@gorhill/ubo-core` parser logic.
   - Real-time conversion statistics display:
     - **Target Domains**: Unique hostnames targeted by the rules.
     - **Hide Rules**: Pure cosmetic hide selectors (`display: none`).
     - **Style Rules**: Declarative style injection rules (`:style(...)`).
     - Clear breakdown distinguishing **Desktop** and **Mobile** configurations.
   - Three independent one-click download buttons:
     - **Desktop Configuration**: `ubol-config-desktop.json`
     - **Mobile Configuration**: `ubol-config-mobile.json`
     - **Complete Configuration**: `ubol-config.json`
   - Explicit error alert panel showing actionable syntax and structure details if an invalid file is uploaded.

## Architecture & Specifications

### 1. Data Contract (Zod Schema)

```ts
import { z } from "zod";

export const UbolConfigSchema = z
  .object({
    version: z.string().optional(),
    filteringModes: z
      .object({
        none: z.array(z.string()).default([]),
        basic: z.array(z.string()).default([]),
        optimal: z.array(z.string()).default([]),
        complete: z.array(z.string()).default([]),
      })
      .optional(),
    customFilters: z.array(z.tuple([z.string(), z.array(z.string())])),
    sandboxFilters: z.array(z.string()).optional(),
  })
  .loose();

export type UbolConfig = z.infer<typeof UbolConfigSchema>;
```

- **`customFilters`**: Pure cosmetic hide rules, grouped by hostname: `[domain, [selector1, selector2, ...]]`.
- **`sandboxFilters`**: Style injection rules containing `:style(...)`, formatted as standard uBO filter strings: `domain##selector:style(property: value !important; ...)`.
- **Global Generic Rules**: Rules with empty domains or `*` use `*` domain in `customFilters` and `*##` prefix in `sandboxFilters`.

### 2. Compilation Rules

- **Cosmetic Hide Rules**:
  - Declarations containing only `display: none` compile directly into `customFilters`.
- **Style Injection Rules**:
  - General CSS declarations compile into `sandboxFilters` with enforced `!important`.
- **Media Query Elimination**:
  - Color scheme media queries (`@media (prefers-color-scheme: dark)`) are merged at AST level into modern CSS `light-dark(lightVal, darkVal)` with `color-scheme: light dark !important;` enforced at root.
  - CSS `filter` properties under `@media (prefers-color-scheme: dark)` are compiled into `:matches-media((prefers-color-scheme: dark))` rules.
  - Pointer media queries (`@media (pointer: coarse)` / `@media (pointer: fine)`) and style titles (`ubo style desktop` / `ubo style mobile`) designate mobile vs desktop scope.

### 3. Repository Structure

```text
├── .github/workflows/
│   ├── ci.yml                 # Cross-platform CI verification (Linux, macOS, Windows)
│   ├── deploy.yml             # GitHub Pages automated deployment workflow
│   └── node-canary.yml        # Node.js canary testing workflow
├── public/                    # Static assets
├── src/
│   ├── core/
│   │   ├── converter.ts       # AST parsing and selector normalization helpers
│   │   ├── schema.ts          # Zod validation schema
│   │   └── stylus-migrator.ts # PostCSS Stylus migration utility
│   ├── stubs/
│   │   └── node-stubs.ts      # Browser stubs for path, fs, and source-map-js
│   ├── types/
│   │   └── ubo-core.d.ts      # TypeScript definitions for @gorhill/ubo-core
│   ├── main.ts                # Client-side converter controller & stats computation
│   └── style.css              # Converter interface styling
├── tests/
│   ├── converter.test.ts      # Parser and selector unit tests
│   ├── main.test.ts           # Client-side stats & validation unit tests
│   ├── stylus-migrator.test.ts# Stylus migration unit tests
│   └── e2e/
│       └── converter.spec.ts  # Playwright E2E integration tests
├── index.html                 # Static web entry point
├── playwright.config.ts       # Playwright E2E configuration
├── vite.config.ts             # Vite configuration with relative base and stubs
└── vitest.config.ts           # Vitest unit test configuration
```

## Deployment Target (GitHub Pages)

The project is deployed directly to GitHub Pages:

- **Live URL**: [https://florencea.github.io/stylus-to-ubol/](https://florencea.github.io/stylus-to-ubol/)

1. **Workflow**: `.github/workflows/deploy.yml` builds the production distribution and deploys to GitHub Pages automatically after `.github/workflows/ci.yml` passes on the `main` branch.
2. **Path Portability**: `vite.config.ts` sets `base: './'` so assets resolve correctly under any repository name or subpath.
3. **Repository Setup**: In GitHub repository settings under **Settings > Pages**, set **Source** to **GitHub Actions**.

## Development & Verification

### Prerequisites

- Node.js 24.x (defined in `package.json` engines)
- npm

### Commands

```bash
# Install dependencies
npm install

# Start local development server
npm run dev

# Run full verification suite (typecheck, lint, format check, dead code check, tests, build)
npm run check

# Run unit tests
npm run agent:test:unit

# Run Playwright E2E tests
npm run agent:test:e2e

# Check and fix lint issues
npm run agent:lint
npm run agent:lint:fix

# Check formatting
npm run format:check

# Build production distribution
npm run build

# Preview production build locally
npm run preview
```
