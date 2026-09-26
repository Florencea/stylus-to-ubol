# Agent Development Guidelines

Guidelines for AI agents and human contributors working on this repository.

## 1. Project Overview & Hard Rules

- **Unidirectional Data Flow**: Stylus JSON export is the sole Single Source of Truth (SSOT). Conversion is strictly one-way: Stylus JSON compiles to uBOL JSON configurations (desktop, mobile, and complete). There is no reverse conversion back to Stylus.
- **Zero CSS File Persistence**: Do not persist intermediate `.css` files to disk. All conversions are performed in memory. The sole persistent data asset is uBOL backup JSON.
- **Rules Splitting Architecture**:
  - `customFilters`: Dedicated to pure cosmetic hide selectors grouped by domain: `[domain, [selector1, selector2, ...]]`.
  - `sandboxFilters`: Dedicated to `:style(...)` style injection rules stored as full uBO syntax strings: `domain##selector:style(...)`.
  - Global generic rules (empty domains or `*`) use `*` domain in `customFilters` and `*##` prefix in `sandboxFilters`.
- **Forbidden `@media` in uBOL Rules**:
  - Color scheme media queries must be parsed at AST level and converted to modern CSS `light-dark(lightVal, darkVal)` with `color-scheme: light dark !important;`.
  - Platform and device conditions must be classified during migration (via pointer media queries or section naming) or use uBO preprocessor directives (`!#if env_mobile` / `!#endif`).
  - All declarations must enforce `!important`.
- **Language & Style Constraints**:
  - Agent responses to the user in chat must use Traditional Chinese (繁體中文).
  - All other project artifacts—including source code, comments, UI text, documentation, commit messages, and tests—must use concise English.
  - Do not use unnecessary emojis across the codebase or UI.
- **Deployment Target**:
  - GitHub Pages via automated workflow (`.github/workflows/deploy.yml`).
  - Vite base path must remain relative (`base: './'`) for path portability.

## 2. Frictionless Agent Scripts

Match commands against the pre-approved whitelist in `package.json`:

- `npm run agent:verify:gate`: Full gatekeeper verification (unit tests, build, E2E tests).
- `npm run agent:verify:unit`: Typecheck, lint, and unit tests.
- `npm run agent:verify:inner`: Typecheck and lint.
- `npm run agent:typecheck`: Typecheck without color formatting.
- `npm run agent:lint`: ESLint with zero-warning threshold.
- `npm run agent:lint:fix`: ESLint auto-fix.
- `npm run agent:format`: Prettier format.
- `npm run agent:test:unit`: Vitest run with TAP-flat reporter.
- `npm run agent:test:e2e`: Playwright E2E tests with line reporter.
- `npm run agent:lint:ci`: Actionlint check on workflow YAML files.

## 3. Verification Protocol

Always execute verification before concluding any task:

```bash
# Complete verification suite
npm run check
```

The verification loop includes:

- TypeScript check: `npm run typecheck` (`tsc -b`)
- ESLint check: `npm run lint` (`eslint`)
- Formatting check: `npm run format:check` (`prettier . --check`)
- Dead code analysis: `npm run check:deadcode` (`knip`)
- Unit tests: `npm run test` (`vitest run`)
- E2E tests: `npm run test:e2e` (`playwright test`)
- Production build: `npm run build` (`vite build`)

All checks must pass with zero errors and zero warnings.

## 4. Architecture & Core Modules

- `src/core/schema.ts`: Zod schema definition for uBOL backup JSON (`UbolBackupSchema`, `UbolConfigSchema`).
- `src/core/converter.ts`: AST-based CSS parser and selector normalization helpers.
- `src/core/migrator/`: Single-responsibility modules (AST walker, color detector, formatter, rule synthesizer, types).
- `src/core/stylus-migrator.ts`: Pipeline facade orchestrating Stylus JSON export migration to uBOL backup format.
- `src/main.ts`: Client-side converter controller, statistics computation, and JSON export triggers.
- `src/style.css`: Minimalist converter UI stylesheet.
- `tests/`: Vitest unit tests (`converter.test.ts`, `main.test.ts`, `stylus-migrator.test.ts`).
- `tests/e2e/`: Playwright end-to-end integration tests (`converter.spec.ts`).

## 5. Git Workflow & Commit Restrictions

- **NEVER execute `git commit` directly**: Local environment uses 1Password SSH signing; running `git commit` in non-interactive/subshell will fail.
- **Standard Protocol**:
  1. Stage changes with `git add <files>`.
  2. Output the complete `git commit -m "..."` command with a concise commit message in English in chat for user to review and run locally.
