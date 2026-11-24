# Agent Development Guidelines

Guidelines for contributors on the **`stylus-to-ubol`** repository.

## 1. Architecture Map

| Layer          | Path                | Responsibility                                                        |
| :------------- | :------------------ | :-------------------------------------------------------------------- |
| **Static Web** | `src/index.html`    | Client-side interface (source directory = GitHub Pages artifact)      |
| **CSS Parser** | `src/css-parser.js` | Zero-dependency strict CSS subset parser with line/column diagnostics |
| **Validator**  | `src/validate.js`   | Zero-dependency ES2023 fail-fast runtime data contract validators     |
| **Compiler**   | `src/compiler.js`   | Rules splitting, `@media` synthesis, base config merge, stats         |
| **Storage**    | `src/storage.js`    | Browser `localStorage` persistence with safe contract validation      |
| **App Entry**  | `src/main.js`       | Client-side converter controller, DOM guards & interactions           |
| **UI Styles**  | `src/style.css`     | Minimalist converter UI stylesheet served directly from `src/`        |
| **Scripts**    | `scripts/serve.js`  | Node built-in static HTTP server serving `src/` directly              |
| **Tests**      | `test/`             | Node `node:test` unit suite & native Playwright Chromium E2E          |
| **Rules**      | `.agents/rules/`    | Domain-specific modular rules (`compiler`, `testing`)                 |

---

## 2. Core SSOT & Invariants

- **Single Source of Truth**: Stylus JSON export is the sole Single Source of Truth (SSOT). Conversion is strictly one-way: Stylus JSON compiles to uBOL JSON (`my-ubol-settings.json`).
- **Zero Build, Zero Bundler, Zero Runtime Dependencies**: `src/` is both the source directory and the deployed GitHub Pages artifact. There is no bundler, no transpiler, no `dist/` directory, and zero runtime `dependencies` in `package.json`. All browser modules load natively via relative ES module paths and `<link rel="modulepreload">`.
- **Zero CSS File Persistence**: Do not persist intermediate `.css` file assets to disk. All conversions are performed in memory.
- **Rules Splitting SSOT**: `customFilters` for pure cosmetic hide rules; `sandboxFilters` for `:style(...)` style injections.
- **Headless Compiler Core**: Keep `src/compiler.js`, `src/css-parser.js`, and `src/validate.js` free of DOM and browser globals (`globals.es2023` enforced by ESLint).
- **Pure ES2023 JavaScript & Strict Native Contracts**: Enforce all external and public API data contracts via `src/validate.js` (`ValidationError` on type mismatches; `safeParse*` for untrusted boundaries). Reject malformed or unsupported CSS syntax in `src/css-parser.js` with `CssParseError` reporting style name, section index, domain, line, column, and snippet. ESLint 10 (`eslint.config.js`) uses `@eslint/js` recommended plus strict core rules, `noInlineConfig: true`, `--max-warnings 0`, and zero-config Prettier formatting. Never use `/* eslint-disable */`.
- **Supply-Chain & Cooldown Governance**: Keep `ignore-scripts=true`, `save-exact=true`, `install-strategy=linked`, `strict-peer-deps=true`, and `engine-strict=true` in `.npmrc`. Omit root `engines.node` in `package.json` so `.npmrc` `engine-strict=true` enforces installed packages' declared `engines` ranges directly. Batch-update `devDependencies` quarterly/semi-annually with a 7–14 day cooldown window; patch immediately only for security CVEs. Use `npm ci` for clean installs and `npm run test:setup` (`playwright install chromium`) explicitly for browser binaries.
- **Exact SemVer Action Pinning**: Pin GitHub Actions to exact stable SemVer tags (`@vX.Y.Z`, never `@v1` or `@v7.0`) and validate `.github/workflows/*.yml` locally with `npm run lint:ci` (`actionlint`).

---

## 3. Shared Verification & Workflow Commands

Humans and agents share the same standard `npm run` commands:

- **Local Development Server**: `npm run dev` (serves `src/` directly via Node HTTP server)
- **Inner-Loop Static Checks**: `npm run lint && npm run format:check`
- **Auto-Fix Lint & Format**: `npm run lint:fix && npm run format`
- **Unit Suite**: `npm run test:unit`
- **E2E Browser Suite**: `npm run test:e2e` (runs directly against `src/`)
- **Full Verification Gate (DoD)**: `npm run verify` (`lint`, `format:check`, `npm test`)
- **CI Workflow Linting**: `npm run lint:ci` (`actionlint`)

---

## 4. Git Workflow & Commit Restrictions

- **NEVER execute `git commit` directly**: Local environment uses 1Password SSH signing; non-interactive commit fails.
- **Protocol**: Stage changes with `git add <files>` and output `git commit -m "..."` in English for user to run locally.

---

## 5. Language & Planning Standards

- **Traditional Chinese for Plans & Responses**: All plans, walkthroughs, and chat responses must strictly be written in **Traditional Chinese (繁體中文)**.
- **Code Artifacts**: Source code, inline comments, commit messages, and automated tests must use concise English.
