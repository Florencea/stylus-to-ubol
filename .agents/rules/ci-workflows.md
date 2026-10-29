---
trigger: glob
globs: ".github/workflows/**"
description: CI workflow standards, action versioning policies, and actionlint guardrails.
---

# CI & GitHub Actions Workflow Standards

Standards for maintaining and updating GitHub Actions workflows in `stylus-to-ubol`.

## 1. Action Versioning Policy (Major Floating Tag SSOT)

- **Floating Major Tags Mandatory**: Always reference GitHub Actions via their latest floating Major version tag (e.g. `voidzero-dev/setup-vp@v1`, `actions/checkout@v7`, `actions/cache@v6`, `actions/upload-artifact@v7`, `actions/configure-pages@v6`, `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5`).
- **No Exact Patch Pinning**: STRICTLY PROHIBITED to pin exact minor/patch versions (e.g. never use `@v1.21.2`). This ensures upstream security fixes and environment compatibility updates are received seamlessly.

## 2. Shift-Left Local Verification (`actionlint`)

- **Strict Requirement**: Whenever `.github/workflows/` files are added or modified, running `actionlint` locally with **0 errors and 0 warnings** is mandatory before staging (`git add`).
- **Execution Script**: Execute via `vpr agent:lint:ci` (or `actionlint`).

## 3. Offline Guardrail Boundaries

- **Offline-Only Invariant**: `actionlint` is strictly an offline shift-left verification tool.
- **Remote Workflow Invariant**: NEVER embed `actionlint` steps or jobs into remote GitHub Actions YAML workflow files (`.github/workflows/*.yml`).
