---
trigger: glob
globs: "src/compiler.ts, test/compiler.test.ts"
description: Architectural invariants and AST transformation rules for the Stylus-to-uBOL compiler engine.
---

# Compiler Engine & Rules Transformation Standards

Domain-specific AST compilation and filter-synthesis guidelines for `src/compiler.ts`.

## 1. Rules Splitting & Routing Invariants

- **customFilters**: Dedicated to pure cosmetic hide selectors grouped by domain: `[domain, [selector1, selector2, ...]]`.
  - Only declarations matching exactly `display:none !important` outside `@media (pointer: coarse)` queries route here.
- **sandboxFilters**: Dedicated to style injection rules stored as full uBO syntax: `domain##selector:style(...)`.
  - Rules containing non-hide properties, missing `!important`, or scoped under `pointer: coarse` route here.
- **Global Generic Rules**: Styles without domain restriction use domain `*` in `customFilters` and `*##` prefix in `sandboxFilters`.

## 2. AST Parsing & @media Processing

- **css-tree In-Memory Traversal**: Traverse parsed AST while maintaining an `@media` stack joined by `and` -> `:matches-media(...)`.
- **Pseudo-Element Separation**:
  - Separate pseudo-elements (`::before`, `::after`, `:before`, `:after`, `first-letter`, `first-line`) from the base selector.
  - When a pseudo-element is present on a procedural rule, omit the `:matches-media` suffix to preserve uBOL selector compatibility.
- **Declaration Serialization**:
  - Declarations preserve property, trimmed value, and `!important` flag (`prop:value !important` or `prop:value`).

## 3. Schema Parsing & Base Config Merging

- **Zod Data Contracts**: Stylus exports are parsed using `StylusExportSchema` supporting legacy tuple format, flat array, and wrapped object formats.
- **Base Config Integration**: When a base `my-ubol-settings.json` is supplied, merge generated filters while preserving upstream keys; otherwise fallback to the default template (`version: "2026.920.1710"`).
