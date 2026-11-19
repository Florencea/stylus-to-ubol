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
- **Strict TypeScript & ESLint**: ESLint uses `strictTypeChecked` and `stylisticTypeChecked` with `typescript-eslint`, `@vitest/eslint-plugin`, `noInlineConfig: true`, `--max-warnings 0`, and Prettier formatting (`prettier-plugin-packagejson`). Never use `// @ts-ignore`, `// @ts-expect-error`, `// @ts-nocheck`, or `/* eslint-disable */`.
- **Strict `.npmrc` Policy**: Keep `ignore-scripts=true`, `save-exact=true`, `install-strategy=linked`, `strict-peer-deps=true`, and `engine-strict=true` in `.npmrc`. Use `npm ci` for clean installs and `npm run test:setup` (`playwright install chromium`) explicitly for browser binaries.
- **Exact SemVer Action Pinning**: Pin GitHub Actions to exact stable SemVer tags (`@vX.Y.Z`, never `@v1` or `@v7.0`) and validate `.github/workflows/*.yml` locally with `actionlint`.

---

## 3. Verification Ladder

- **Inner Loop**: `npm run agent:verify:inner` (`npm run typecheck && npm run lint`)
- **Unit Suite**: `npm run agent:test:unit` (`vitest run --project unit --reporter=tap-flat --no-color`)
- **Unit Verification**: `npm run agent:verify:unit` (`npm run agent:verify:inner && npm run agent:test:unit`)
- **E2E Browser Suite**: `npm run agent:test:e2e` (`vitest run --project e2e --reporter=tap-flat --no-color`)
- **Unified Gate**: `npm run agent:verify:gate` (`npm run agent:verify:unit && npm run build && npm run agent:test:e2e`)
- **Full Verification**: `npm run verify` (`typecheck`, `lint`, `format:check`, `check:deadcode`, `vitest run`, `vite build`)
- **Diagnostics & Formatting**: `npm run lint` (`eslint --max-warnings 0 .`), `npx prettier --write <files>`, `npm run agent:lint:ci` (`actionlint`)

---

## 4. Git Workflow & Commit Restrictions

- **NEVER execute `git commit` directly**: Local environment uses 1Password SSH signing; non-interactive commit fails.
- **Protocol**: Stage changes with `git add <files>` and output `git commit -m "..."` in English for user to run locally.

---

## 5. Language & Planning Standards

- **Traditional Chinese for Plans & Responses**: All plans, walkthroughs, and chat responses must strictly be written in **Traditional Chinese (繁體中文)**.
- **Code Artifacts**: Source code, inline comments, commit messages, and automated tests must use concise English.
