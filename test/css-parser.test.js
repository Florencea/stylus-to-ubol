import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CssParseError, parseCss } from "../src/css-parser.js";

describe("Native CSS Parser", () => {
  describe("valid CSS parsing", () => {
    it("parses standard rules, custom properties, comments, and !important variants", () => {
      const css = `
        /* Leading multi-line
           comment */
        .card {
          --card-bg: #161b22;
          color: red !IMPORTANT;
          background-color: var(--card-bg) ! important;;
          opacity: 0.9
        }
      `;
      const ast = parseCss(css);
      assert.equal(ast.type, "StyleSheet");
      assert.equal(ast.body.length, 1);

      const rule = ast.body[0];
      assert.equal(rule.type, "Rule");
      assert.equal(rule.selectors.length, 1);
      assert.equal(rule.selectors[0].raw, ".card");
      assert.equal(rule.declarations.length, 4);
      assert.deepEqual(
        rule.declarations.map(({ property, value, important }) => ({
          property,
          value,
          important,
        })),
        [
          { property: "--card-bg", value: "#161b22", important: false },
          { property: "color", value: "red", important: true },
          {
            property: "background-color",
            value: "var(--card-bg)",
            important: true,
          },
          { property: "opacity", value: "0.9", important: false },
        ],
      );
    });

    it("preserves commas inside functional pseudo-classes and attribute strings", () => {
      const ast = parseCss(`
        :is(.a, .b), [data-list="x,y"], .c:not(.d, .e) {
          display: none !important;
        }
      `);
      assert.equal(ast.body.length, 1);
      const rule = ast.body[0];
      assert.equal(rule.type, "Rule");
      assert.deepEqual(
        rule.selectors.map((s) => s.raw),
        [":is(.a, .b)", '[data-list="x,y"]', ".c:not(.d, .e)"],
      );
    });

    it("splits top-level pseudo-elements while ignoring colons inside attribute selectors", () => {
      const ast = parseCss(`
        .btn[data-tag=":before"]::after,
        .link:before {
          content: ">";
        }
      `);
      const rule = ast.body[0];
      assert.equal(rule.type, "Rule");
      assert.equal(rule.selectors[0].baseSelector, '.btn[data-tag=":before"]');
      assert.equal(rule.selectors[0].pseudoElement, "::after");
      assert.equal(rule.selectors[1].baseSelector, ".link");
      assert.equal(rule.selectors[1].pseudoElement, ":before");
    });

    it("handles quoted strings, escapes, and unquoted url(data:...) containing semicolons", () => {
      const ast = parseCss(`
        .icon {
          content: "a;b}c !important";
          background-image: url(data:image/svg+xml;utf8,<svg></svg>) !important;
        }
      `);
      const rule = ast.body[0];
      assert.equal(rule.type, "Rule");
      assert.equal(rule.declarations.length, 2);
      assert.equal(rule.declarations[0].value, '"a;b}c !important"');
      assert.equal(rule.declarations[0].important, false);
      assert.equal(
        rule.declarations[1].value,
        "url(data:image/svg+xml;utf8,<svg></svg>)",
      );
      assert.equal(rule.declarations[1].important, true);
    });

    it("parses nested @media rules and normalizes media feature spacing", () => {
      const ast = parseCss(`
        @media screen and (max-width: 768px) {
          @media (pointer: coarse) {
            .banner { display: none !important; }
          }
        }
      `);
      assert.equal(ast.body.length, 1);
      const outer = ast.body[0];
      assert.equal(outer.type, "MediaRule");
      assert.equal(outer.prelude, "screen and (max-width:768px)");
      assert.equal(outer.body.length, 1);

      const inner = outer.body[0];
      assert.equal(inner.type, "MediaRule");
      assert.equal(inner.prelude, "(pointer:coarse)");
      assert.equal(inner.body.length, 1);
      assert.equal(inner.body[0].type, "Rule");
    });
  });

  describe("strict error diagnostics with line and column numbers", () => {
    it("reports exact line and column for missing colon in declaration", () => {
      const css = [".header {", "  color red;", "}"].join("\n");
      assert.throws(
        () =>
          parseCss(css, {
            styleName: "Dark Theme",
            sectionIndex: 2,
            domain: "example.com",
          }),
        (err) => {
          assert.ok(err instanceof CssParseError);
          assert.equal(err.issues.length, 1);
          assert.equal(err.issues[0].line, 2);
          assert.equal(err.issues[0].column, 3);
          assert.match(err.message, /style "Dark Theme"/);
          assert.match(err.message, /section #2/);
          assert.match(err.message, /domain: example\.com/);
          assert.match(err.message, /line 2, column 3/);
          return true;
        },
      );
    });

    it("reports CSS nesting for both standard nested selectors and '&:hover' nesting", () => {
      const css = [
        ".card {",
        "  .title { color: red; }",
        "  &:hover { opacity: 0.5; }",
        "}",
      ].join("\n");

      assert.throws(
        () => parseCss(css),
        (err) => {
          assert.ok(err instanceof CssParseError);
          assert.equal(err.issues.length, 2);
          assert.equal(err.issues[0].line, 2);
          assert.match(err.issues[0].message, /Nested rule/);
          assert.equal(err.issues[1].line, 3);
          assert.match(err.issues[1].message, /Nested rule/);
          return true;
        },
      );
    });

    it("reports unsupported at-rules with exact line number", () => {
      const css = [
        ".ok { color: red; }",
        "@keyframes fade { from { opacity: 0; } to { opacity: 1; } }",
        "@supports (display: grid) { .grid { display: grid; } }",
      ].join("\n");

      assert.throws(
        () => parseCss(css),
        (err) => {
          assert.ok(err instanceof CssParseError);
          assert.equal(err.issues.length, 2);
          assert.equal(err.issues[0].line, 2);
          assert.match(err.issues[0].message, /@keyframes/);
          assert.equal(err.issues[1].line, 3);
          assert.match(err.issues[1].message, /@supports/);
          return true;
        },
      );
    });

    it("reports unclosed comments, unclosed strings, and unclosed blocks", () => {
      assert.throws(
        () => parseCss("\n/* unclosed comment\n.a { color: red; }"),
        (err) => {
          assert.ok(err instanceof CssParseError);
          assert.equal(err.line, 2);
          assert.match(err.message, /Unclosed CSS comment/);
          return true;
        },
      );

      assert.throws(
        () => parseCss('.a {\n  content: "unterminated\n}'),
        (err) => {
          assert.ok(err instanceof CssParseError);
          assert.equal(err.line, 2);
          assert.match(err.message, /Unclosed string literal/);
          return true;
        },
      );

      assert.throws(
        () => parseCss(".a {\n  color: red;"),
        (err) => {
          assert.ok(err instanceof CssParseError);
          assert.equal(err.line, 1);
          assert.match(err.message, /Unclosed rule block/);
          return true;
        },
      );
    });

    it("reports missing property values and empty selectors", () => {
      assert.throws(
        () => parseCss(".a {\n  color: !important;\n}"),
        (err) => {
          assert.ok(err instanceof CssParseError);
          assert.equal(err.line, 2);
          assert.match(err.message, /Missing value/);
          return true;
        },
      );

      assert.throws(
        () => parseCss(".a, {\n  color: red;\n}"),
        (err) => {
          assert.ok(err instanceof CssParseError);
          assert.equal(err.line, 1);
          assert.match(err.message, /Empty selector/);
          return true;
        },
      );
    });
  });
});
