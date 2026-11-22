# Agent Development Guidelines

Guidelines for contributors on the **`stylus-to-ubol`** repository.

## 1. Architecture Map

| Layer         | Path              | Responsibility                                            |
| :------------ | :---------------- | :-------------------------------------------------------- |
| **Compiler**  | `src/compiler.ts` | AST parser, rules splitting, CSS serialization            |
| **Storage**   | `src/storage.ts`  | Browser `localStorage` persistence with Zod validation    |
| **App Entry** | `src/main.ts`     | Client-side converter controller & DOM interactions       |
| **UI Styles** | `src/style.css`   | Minimalist converter UI stylesheet                        |
| **Tests**     | `test/`           | Vitest dual-project tests (in-memory unit & Chromium e2e) |
| **Rules**     | `.agents/rules/`  | Domain-specific modular rules (`compiler`, `testing`)     |

---

## 2. Core SSOT & Invariants

- **Single Source of Truth**: Stylus JSON export is the sole Single Source of Truth (SSOT). Conversion is strictly one-way: Stylus JSON compiles to uBOL JSON (`my-ubol-settings.json`).
- **Zero CSS File Persistence**: Do not persist intermediate `.css` file assets to disk. All conversions are performed in memory.
- **Rules Splitting SSOT**: `customFilters` for pure cosmetic hide rules; `sandboxFilters` for `:style(...)` style injections.
- **Headless Compiler**: Keep `src/compiler.ts` free of DOM and browser globals (`globals.es2023` enforced by ESLint).
- **Strict TypeScript 6 & ESLint**: Type checking uses standard pure-JS TypeScript 6 (`tsc -b --pretty false`). ESLint 10 uses `strictTypeChecked` and `stylisticTypeChecked` with `typescript-eslint`, `@vitest/eslint-plugin`, `noInlineConfig: true`, `--max-warnings 0`, and Prettier formatting (`prettier-plugin-packagejson`). Never use `// @ts-ignore`, `// @ts-expect-error`, `// @ts-nocheck`, or `/* eslint-disable */`.
- **Supply-Chain & Cooldown Governance**: Keep `ignore-scripts=true`, `save-exact=true`, `install-strategy=linked`, `strict-peer-deps=true`, and `engine-strict=true` in `.npmrc`. Omit root `engines.node` in `package.json` so `.npmrc` `engine-strict=true` enforces installed packages' declared `engines` ranges directly. Batch-update toolchain dependencies quarterly/semi-annually with a 7–14 day cooldown window; patch immediately only for CVEs affecting browser runtime (`npm audit --omit=dev`) or build security. Do not pin `knip` in `devDependencies`. Use `npm ci` for clean installs and `npm run test:setup` (`playwright install chromium`) explicitly for browser binaries.
- **Exact SemVer Action Pinning**: Pin GitHub Actions to exact stable SemVer tags (`@vX.Y.Z`, never `@v1` or `@v7.0`) and validate `.github/workflows/*.yml` locally with `npm run lint:ci` (`actionlint`).

---

## 3. Shared Verification & Workflow Commands

Humans and agents share the same standard `npm run` commands:

- **Inner-Loop Static Checks**: `npm run typecheck && npm run lint && npm run format:check`
- **Auto-Fix Lint & Format**: `npm run lint:fix && npm run format`
- **Unit Suite**: `npm run test:unit` (for compact agent output, append `-- --reporter=tap-flat --no-color`)
- **Production Build**: `npm run build`
- **E2E Browser Suite**: `npm run test:e2e` (for compact agent output, append `-- --reporter=tap-flat --no-color`)
- **Full Verification Gate (DoD)**: `npm run verify` (`typecheck`, `lint`, `format:check`, `build`, `npm test`)
- **CI Workflow Linting**: `npm run lint:ci` (`actionlint`)

---

## 4. Git Workflow & Commit Restrictions

- **NEVER execute `git commit` directly**: Local environment uses 1Password SSH signing; non-interactive commit fails.
- **Protocol**: Stage changes with `git add <files>` and output `git commit -m "..."` in English for user to run locally.

---

## 5. Language & Planning Standards

- **Traditional Chinese for Plans & Responses**: All plans, walkthroughs, and chat responses must strictly be written in **Traditional Chinese (繁體中文)**.
- **Code Artifacts**: Source code, inline comments, commit messages, and automated tests must use concise English.
