# uBOL Workbench

A serverless, pure frontend custom style management and debugging workbench using uBlock Origin Lite (uBOL) backup JSON as the single source of truth (SSOT).

**Live Deployment**: [https://florencea.github.io/ubol-workbench/](https://florencea.github.io/ubol-workbench/)

## Core Deliverables

1. **Static Hub (`index.html`)**
   - Minimalist centered card interface for importing single or multiple uBOL backup JSON files directly in the browser conforming to `UbolBackupSchema`.
   - Multi-config support: import desktop and mobile configurations concurrently with side-by-side card inspection, platform badge indicators (`Desktop`, `Mobile`, `Global`), individual removal, and combined rule statistics.
   - Analyzes filter rules across all loaded configurations to extract target domains and dynamically provides a one-click Userscript installation link via `blob:` URL with exact `@match` directives.
   - Built-in error alert area with detailed debug info copying for agent troubleshooting when invalid configurations are imported.

2. **Stylus Migration CLI (`npm run migrate:stylus --`)**
   - Standalone command-line migration utility converting Stylus export JSON into modern uBOL rules using PostCSS AST.
   - Automatically splits rules into `customFilters` (pure `display: none` rules) and `sandboxFilters` (`:style(...)` rules).
   - **Dual Configuration Export (`--dual` / `--split`)**: Splits migration into two distinct SSOT files (`ubol-config-desktop.json` and `ubol-config-mobile.json`) based on Stylus style section names (`ubo style desktop` / `ubo style mobile`) and CSS pointer media queries (`@media (pointer: coarse)` vs `@media (pointer: fine)`).
   - **Targeted Output (`--target <desktop|mobile>`)**: Filters rules to export exclusively for desktop or mobile environments.
   - Translates global/generic rules (empty domains or `*`) to `*##` rules across `customFilters` and `sandboxFilters`.
   - Merges `@media (prefers-color-scheme: dark)` into modern CSS `light-dark()` with `color-scheme: light dark !important;`.
   - Automatically falls back to `stylus.json` input and `ubol-config.json` output when executed in interactive terminal without arguments.

3. **In-Page Userscript Client (`.user.js` / Web Component)**
   - Built with pure native Web Components (`customElements.define('ubol-workbench', ...)`), reactive state management, and open Shadow DOM with zero runtime UI framework dependencies.
   - **Rule Scope Selector**: Toggle between **Global**, **Desktop-only**, and **Mobile-only** rule scopes directly from the workbench toolbar.
   - Three integrated panels:
     - **Hide Selectors**: Real-time cosmetic hide rule editing.
     - **Style Injection**: Declarative CSS property injection.
     - **Dead Code Diagnostics**: Live DOM querying to highlight active vs dead selectors (`0 matches`).
   - Live hot-swap preview: textarea inputs trigger immediate CSS recompilation and update `<style id="ubol-workbench-injected">` in `document.head`.
   - Device perception: monitors screen width (`matchMedia('(max-width: 768px)')`) to toggle between Desktop and Mobile platform rules.
   - Export: compiles working rules into standard uBOL JSON backup format conforming to `UbolBackupSchema`, or dual desktop/mobile configs.

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
- **Preserved Settings**: Settings outside `customFilters` and `sandboxFilters` (such as `version`, `filteringModes`, and any extension preferences) are preserved untouched when reading and exporting uBOL backups.

### 2. Bidirectional Conversion Rules

- **Cosmetic Hide**:
  - uBOL Filter: `domain##.ad-banner, #sidebar`
  - Output CSS: `.ad-banner, #sidebar { display: none !important; }`
  - Inverse: Rules containing only `display: none` declarations compile to `domain##selector`.
- **Style Injection**:
  - uBOL Filter: `domain##.content:style(color: light-dark(#000, #fff) !important;)`
  - Output CSS: `.content { color: light-dark(#000, #fff) !important; }`
  - Inverse: General style declarations compile to `domain##selector:style(...)` with enforced `!important`.
- **Media Query Elimination & CSS Filter Conversion**:
  - Color scheme media queries for standard color declarations are parsed at AST level and unified into `light-dark(lightVal, darkVal)` with `color-scheme: light dark !important;` enforced at root.
  - CSS `filter` properties (`filter`, `-webkit-filter`, `backdrop-filter`, `-webkit-backdrop-filter`) accept `<filter-function-list>` rather than `<color>` values, rendering CSS `light-dark()` invalid. They are compiled into uBO procedural `:matches-media((prefers-color-scheme: dark))` and `:matches-media((prefers-color-scheme: light))` filters stored in `sandboxFilters`.
  - When converting uBOL rules back to CSS for in-page injection and live preview, `:matches-media(...)` rules are cleanly unwrapped into native `@media` blocks.
  - Device/platform conditional filters use uBO preprocessor directives (`!#if env_mobile` / `!#endif`).
- **Zero Disk CSS Persistence**:
  - No intermediate `.css` files are persisted to disk. All conversions are performed in memory.

### 3. Repository Structure

```text
├── .github/workflows/
│   ├── ci.yml                 # Cross-platform CI verification (Linux, macOS, Windows)
│   ├── deploy.yml             # GitHub Pages automated deployment workflow
│   └── node-canary.yml        # Node.js canary testing workflow
├── public/                    # Static assets
├── src/
│   ├── cli/
│   │   └── migrate-stylus.ts  # CLI tool for Stylus migration
│   ├── core/
│   │   ├── converter.ts       # AST-based bidirectional parser & compiler
│   │   ├── schema.ts          # Zod validation schema
│   │   └── stylus-migrator.ts # PostCSS Stylus migration utility
│   ├── stubs/
│   │   └── node-stubs.ts      # Browser stubs for path, fs, and source-map-js
│   ├── types/
│   │   └── ubo-core.d.ts      # TypeScript definitions for @gorhill/ubo-core
│   ├── userscript/
│   │   ├── generator.ts       # Standalone .user.js compiler with @match headers
│   │   ├── shadow-modal.ts    # Shadow DOM templates and styles
│   │   └── workbench.ts       # <ubol-workbench> Web Component controller
│   ├── main.ts                # Minimalist Hub application logic
│   └── style.css              # Minimalist Hub styling
├── tests/
│   ├── converter.test.ts      # Parser and compiler unit tests
│   ├── stylus-migrator.test.ts# Stylus migration unit tests
│   ├── workbench.test.ts      # Web Component and generator unit tests
│   └── e2e/
│       └── workbench.spec.ts  # Playwright E2E integration tests
├── index.html                 # Static Hub entry point
├── playwright.config.ts       # Playwright E2E configuration
├── vite.config.ts             # Vite configuration with relative base and stubs
└── vitest.config.ts           # Vitest unit test configuration
```

## Deployment Target (GitHub Pages)

The project is deployed directly to GitHub Pages:

- **Live URL**: [https://florencea.github.io/ubol-workbench/](https://florencea.github.io/ubol-workbench/)

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

## Desktop vs Mobile Dual-Configuration Architecture

In Stylus, rulesets such as `ubo style desktop` and `ubo style mobile` utilize `@media (pointer: coarse)` and `@media (pointer: fine)` to differentiate touch/mobile and pointer/desktop environments. This dual-configuration system is fully integrated across the pipeline:

1. **Dual Configuration Export (`--dual` / `--split`)**:
   - The CLI migrator splits Stylus exports into two distinct SSOT backup files:
     - `ubol-config-desktop.json`: Contains generic global rules + desktop-targeted rules.
     - `ubol-config-mobile.json`: Contains generic global rules + mobile-targeted rules.
   - Pointer media queries (`@media (pointer: coarse)` -> Mobile, `@media (pointer: fine)` -> Desktop) and style section titles are automatically classified.
   - Command usage:
     ```bash
     # Split into ubol-config-desktop.json and ubol-config-mobile.json
     npm run migrate:stylus -- stylus.json --dual

     # Target a single platform exclusively
     npm run migrate:stylus -- stylus.json --target desktop
     npm run migrate:stylus -- stylus.json --target mobile
     ```

2. **Multi-Config Hub UI**:
   - Static Hub (`index.html`) accepts multiple uBOL backup JSON files concurrently via file picker or drag-and-drop.
   - Automatically detects platform scope based on filename and rules, rendering side-by-side cards with `Desktop`, `Mobile`, or `Global` badges.
   - Computes combined rule metrics and generates a unified Userscript with complete `@match` domains across all loaded files.

3. **Userscript Scope Selector**:
   - The in-page `<ubol-workbench>` modal UI features a top-level **Rule Scope** bar (**Global**, **Desktop-only**, **Mobile-only**).
   - Rules can be authored per scope with independent text areas and live DOM application.
   - uBO preprocessor directives (`!#if env_mobile` / `!#if !env_mobile` / `!#endif`) are supported for bidirectional importing and exporting.
