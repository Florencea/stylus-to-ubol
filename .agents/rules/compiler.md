---
trigger: glob
globs: "src/compiler.ts, test/compiler.test.ts"
description: Rules for AST transformations, Stylus extraction, and uBlock Origin Lite configuration compilation.
---

# Compiler Engine & Rules Transformation Standards

Guidelines for the Stylus-to-uBOL compiler engine.

## 1. Single Source of Truth & Data Flow

- **Unidirectional Data Flow**: Stylus JSON export is the sole Single Source of Truth (SSOT). Conversion is strictly one-way: Stylus JSON compiles to uBOL JSON configuration (`my-ubol-settings.json`). There is no reverse conversion back to Stylus.
- **Zero CSS File Persistence**: Do not persist intermediate `.css` file assets to disk. All conversions are performed in memory. The sole persistent data asset is uBOL settings JSON.
- **In-Memory AST Architecture**: All AST parsing and style transformations run in memory via `css-tree`.

## 2. Rules Splitting Architecture

- **customFilters**: Dedicated to pure cosmetic hide selectors grouped by domain: `[domain, [selector1, selector2, ...]]`.
- **sandboxFilters**: Dedicated to `:style(...)` style injection rules stored as full uBO syntax strings: `domain##selector:style(...)`.
- **Global Generic Rules**: Generic rules (empty domains or `*`) use `*` domain in `customFilters` and `*##` prefix in `sandboxFilters`.

## 3. Procedural Rules & @media Handling

- Declarations are serialized into `:style(...)` rules.
- Pure `display: none !important` rules outside coarse pointer queries route to `customFilters`.
- Nested `@media` scopes compile to `:matches-media(...)` suffixes.
- Pseudo-elements are separated to ensure `:matches-media` is placed before pseudo-elements.
- Declarations preserve the original CSS `!important` state.
