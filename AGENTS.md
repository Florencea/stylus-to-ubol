<!--VITE PLUS START-->

## Vite+ Guidelines

This project uses Vite+ to manage development tools. Always use `vp` (or `vpr` shorthand for `vp run`) to run commands:

- `vpr <script>` (or `vp run <script>`): Run scripts from `package.json`
- `vp install`: Install dependencies
- `vp update`: Update dependencies
- `vp test`: Run Vitest tests
- `vp build`: Build production bundles
- `vp check`: Run linter, typecheck, format checks
- `vp fmt`: Run formatter
- `vp lint`: Run linter

<!--VITE PLUS END-->

# Agent Development Guidelines

Guidelines for AI agents and human contributors working on this repository.

## 1. Architecture Map

| Layer         | Path              | Responsibility                                            |
| :------------ | :---------------- | :-------------------------------------------------------- |
| **Compiler**  | `src/compiler.ts` | AST parser, rules splitting, CSS serialization            |
| **App Entry** | `src/main.ts`     | Client-side converter controller & DOM interactions       |
| **UI Styles** | `src/style.css`   | Minimalist converter UI stylesheet                        |
| **Tests**     | `test/`           | Vitest dual-project tests (in-memory unit & Chromium e2e) |
| **Rules**     | `.agents/rules/`  | Domain-specific modular rules                             |

---

## 2. Core SSOT & Invariants

- **Single Source of Truth**: Stylus JSON export is the sole Single Source of Truth (SSOT). Conversion is strictly one-way: Stylus JSON compiles to uBOL JSON (`my-ubol-settings.json`).
- **Zero CSS File Persistence**: Do not persist intermediate `.css` file assets to disk. All conversions are performed in memory.
- **Rules Splitting SSOT**: `customFilters` for pure cosmetic hide rules; `sandboxFilters` for `:style(...)` style injections.
- **Domain Rules**: Path-specific rules live under `.agents/rules/` (`compiler`, `testing`, `ci-workflows`) and activate via file globbing.

---

## 3. Frictionless Execution (Whitelist-First)

Prioritize `vpr agent:*` commands matching Antigravity's whitelist:

- **Gate**: `vpr agent:verify:gate` (unit -> build -> e2e) or `vpr verify`
- **Inner Loop**: `vpr agent:verify:inner` (`vp check`)
- **Unit Tests**: `vpr agent:test:unit` (`vp test run --project unit --reporter=tap-flat --no-color`)
- **E2E Tests**: `vpr agent:test:e2e` (`vp test run --project e2e --reporter=tap-flat --no-color`)
- **Lint & Fix**: `vpr agent:lint:fix` (`vp check --fix`)
- **CI Lint**: `vpr agent:lint:ci` (`actionlint` 0 errors/warnings)
- **Task Caching**: Scripts executed via `vpr` leverage Vite Task caching (`run.cache: { scripts: true }`). Unmodified steps replay in milliseconds. Use `vpr --last-details` to inspect cache hit status or `vp cache clean` / `vpr --no-cache` to force clean execution.

---

## 4. Git Workflow & Commit Restrictions

- **NEVER execute `git commit` directly**: Local environment uses 1Password SSH signing; non-interactive commit fails.
- **Protocol**: Stage changes with `git add <files>` and output `git commit -m "..."` in English for user to run locally.

---

## 5. Language & Planning Standards

- **Traditional Chinese for Plans & Responses**: All plans, walkthroughs, and chat responses must strictly be written in **Traditional Chinese (繁體中文)**.
- **Code Artifacts**: Source code, inline comments, commit messages, and automated tests must use concise English.
