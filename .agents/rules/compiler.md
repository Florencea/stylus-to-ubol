---
trigger: glob
globs: "src/compiler.js, src/css-parser.js, src/validate.js, test/compiler.test.js, test/css-parser.test.js"
description: Architectural invariants, native CSS subset grammar, and AST transformation rules for the Stylus-to-uBOL compiler engine.
---

# Compiler Engine & Rules Transformation Standards

Domain-specific CSS parsing, AST compilation, and filter-synthesis guidelines for `src/css-parser.js`, `src/validate.js`, and `src/compiler.js`.

## 1. Rules Splitting & Routing Invariants

- **customFilters**: Dedicated to pure cosmetic hide selectors grouped by domain: `[domain, [selector1, selector2, ...]]`.
  - Only declarations matching exactly `display:none !important` outside `@media (pointer: coarse)` queries route here.
- **sandboxFilters**: Dedicated to style injection rules stored as full uBO syntax: `domain##selector:style(...)`.
  - Rules containing non-hide properties, missing `!important`, or scoped under `pointer: coarse` route here.
- **Global Generic Rules**: Styles without domain restriction use domain `*` in `customFilters` and `*##` prefix in `sandboxFilters`.

## 2. Native Strict CSS Parser & Error Diagnostics

- **Zero-Dependency Recursive-Descent Parser (`src/css-parser.js`)**: Parse standard rules, nested `@media` blocks, comments, quoted strings with escapes, functional pseudo-classes (`:is()`, `:not()`, `:has()`), quoted and unquoted `url(...)`, custom properties (`--*`), and `!important` without third-party packages.
- **Strict Failure with Actionable Line Numbers**: Reject malformed CSS (unclosed comments/strings/braces, missing `:`, empty values/selectors), CSS nesting (`{` inside declaration blocks), and unsupported at-rules (anything other than `@media`) by throwing `CssParseError` with exact `styleName`, `sectionIndex`, `domain`, 1-based `line`, `column`, and code caret snippet. Collect up to `MAX_CSS_ERRORS` (20) deduplicated issues across the upload so humans can fix Stylus styles in one pass.
- **Media & Pseudo-Element Processing**:
  - Maintain an `@media` stack joined by `and` -> `:matches-media(...)`, normalizing whitespace inside media feature parens (`(pointer: coarse)` -> `(pointer:coarse)`).
  - Separate depth-0 pseudo-elements (`::*`, `:before`, `:after`, `:first-letter`, `:first-line`) from the base selector.
  - When a pseudo-element is present on a procedural rule, omit the `:matches-media` suffix to preserve uBOL selector compatibility.
- **Declaration Serialization**:
  - Declarations preserve property, trimmed value, and `!important` flag (`prop:value !important` or `prop:value`).

## 3. Fail-Fast Native Contracts & Base Config Merging

- **Native Data Contracts (`src/validate.js`)**: Parse Stylus exports via `parseStylusExport` supporting legacy tuple format, flat array, wrapped object, and single style object formats while carrying optional `name` and 1-based `sectionIndex` metadata for CSS diagnostics.
- **Public API Runtime Validation**: Validate inputs at public function entrypoints (`serializeDeclaration`, `splitSelectorAndPseudoElement`, `buildUboRules`, `computeConfigStats`, `parseUbolBaseConfig`, `compileStylus`) via `src/validate.js` so type mismatches throw `ValidationError` immediately; keep internal AST traversal loops free of redundant re-validation.
- **Base Config Integration**: When a base `my-ubol-settings.json` is supplied, merge generated filters while preserving upstream keys; otherwise fallback to the default template (`version: "2026.920.1710"`).
