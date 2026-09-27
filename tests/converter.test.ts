import { describe, expect, it } from "vitest";
import { AstFilterParser } from "@gorhill/ubo-core/js/static-filtering-parser.js";
import {
  compileCssToUbolRules,
  normalizeSelector,
  splitSelectorList,
} from "../src/core/converter.ts";

describe("Converter Core", () => {
  const uboParser = new AstFilterParser();

  const validateRuleWithUbo = (rule: string) => {
    uboParser.parse(rule);
    expect(uboParser.hasError(), `Rule had error: ${rule}`).toBe(false);
    expect(uboParser.isCosmeticFilter(), `Rule was not cosmetic: ${rule}`).toBe(
      true,
    );
  };

  describe("compileCssToUbolRules", () => {
    it("compiles pure display: none CSS rules into cosmetic hide rules", () => {
      const css = `
        .ad-banner, #sidebar {
          display: none !important;
        }
        .ad-footer {
          display: none;
        }
      `;
      const rules = compileCssToUbolRules(css, "example.com");
      expect(rules).toEqual([
        "example.com##.ad-banner",
        "example.com###sidebar",
        "example.com##.ad-footer",
      ]);
      for (const r of rules) validateRuleWithUbo(r);
    });

    it("compiles general CSS rules into :style(...) rules preserving original !important state", () => {
      const css = `
        .btn-primary {
          background-color: #007bff;
          border-radius: 4px !important;
        }
      `;
      const rules = compileCssToUbolRules(css, "example.com");
      expect(rules).toEqual([
        "example.com##.btn-primary:style(background-color: #007bff; border-radius: 4px !important)",
      ]);
      for (const r of rules) validateRuleWithUbo(r);
    });

    it("merges prefers-color-scheme: dark and light media query into light-dark(...) and color-scheme", () => {
      const css = `
        :root {
          --header-bg: #fff;
        }
        .card {
          background: #ffffff;
          color: #333333;
          font-size: 14px;
        }
        @media (prefers-color-scheme: light) {
          .card {
            border-color: #e0e0e0;
          }
        }
        @media (prefers-color-scheme: dark) {
          .card {
            background: #1e1e1e;
            color: #ffffff;
            font-size: 14px;
            box-shadow: 0 0 10px #000;
          }
        }
      `;
      const rules = compileCssToUbolRules(css, "example.com");
      expect(rules.some((r) => r.includes("@media"))).toBe(false);

      const cardRule = rules.find((r) => r.includes("##.card:style"));
      expect(cardRule).toBeDefined();
      // Different values -> light-dark()
      expect(cardRule).toContain("background: light-dark(#ffffff, #1e1e1e);");
      expect(cardRule).toContain("color: light-dark(#333333, #ffffff);");
      // Same value in both light and dark -> plain value
      expect(cardRule).toContain("font-size: 14px");
      // Light-only property -> :matches-media((prefers-color-scheme: light))
      const lightCardRule = rules.find((r) =>
        r.includes(
          "##.card:matches-media((prefers-color-scheme: light)):style",
        ),
      );
      expect(lightCardRule).toBeDefined();
      expect(lightCardRule).toContain("border-color: #e0e0e0");
      expect(cardRule).not.toContain("border-color");
      // Dark-only property -> :matches-media((prefers-color-scheme: dark))
      const darkCardRule = rules.find((r) =>
        r.includes("##.card:matches-media((prefers-color-scheme: dark)):style"),
      );
      expect(darkCardRule).toBeDefined();
      expect(darkCardRule).toContain("box-shadow: 0 0 10px #000");

      // Root rule should contain color-scheme
      const rootRule = rules.find((r) => r.includes("##:root:style"));
      expect(rootRule).toBeDefined();
      expect(rootRule).toContain("color-scheme: light dark !important;");
      expect(rootRule).toContain("--header-bg: #fff");

      for (const r of rules) validateRuleWithUbo(r);
    });

    it("supports empty domain for generic cosmetic rules", () => {
      const css = `
        .banner {
          display: none;
        }
      `;
      const rules = compileCssToUbolRules(css, "");
      expect(rules).toEqual(["##.banner"]);
      for (const r of rules) validateRuleWithUbo(r);
    });

    it("compiles generic @media queries (e.g. min-width) to :matches-media", () => {
      const css = `
        @media (min-width: 768px) {
          .nav { display: flex; }
        }
      `;
      const rules = compileCssToUbolRules(css, "example.com");
      expect(rules).toEqual([
        "example.com##.nav:matches-media((min-width: 768px)):style(display: flex)",
      ]);
      for (const r of rules) validateRuleWithUbo(r);
    });

    it("handles empty CSS or rules without declarations gracefully", () => {
      expect(compileCssToUbolRules("", "example.com")).toEqual([]);
      expect(compileCssToUbolRules(".empty {}", "example.com")).toEqual([]);
    });

    it("handles multi-declaration rules with display: none and other styles by compiling to :style(...)", () => {
      const css = `
        .modal {
          display: none;
          opacity: 0;
        }
      `;
      const rules = compileCssToUbolRules(css, "example.com");
      expect(rules).toEqual([
        "example.com##.modal:style(display: none; opacity: 0)",
      ]);
      for (const r of rules) validateRuleWithUbo(r);
    });

    it("normalizes legacy single-colon pseudo-elements in selectors", () => {
      expect(normalizeSelector(".btn:before")).toBe(".btn::before");
      expect(normalizeSelector(".btn:after")).toBe(".btn::after");
      expect(normalizeSelector(".text:first-letter")).toBe(
        ".text::first-letter",
      );
      expect(normalizeSelector(".para:first-line")).toBe(".para::first-line");
      expect(normalizeSelector("input:placeholder")).toBe("input::placeholder");
      expect(normalizeSelector(".btn::before")).toBe(".btn::before");
      expect(normalizeSelector(".btn:hover")).toBe(".btn:hover");
    });

    it("correctly splits selector lists without breaking nested parentheses or quotes", () => {
      const complex =
        ':is(code, kbd, pre, samp), #cursor, img[src="data:image/png;base64,iVBORw0KGgoAAA"], body:not(:lang(en), :lang(fr))';
      const parts = splitSelectorList(complex);
      expect(parts).toEqual([
        ":is(code, kbd, pre, samp)",
        "#cursor",
        'img[src="data:image/png;base64,iVBORw0KGgoAAA"]',
        "body:not(:lang(en), :lang(fr))",
      ]);
    });

    it("handles style rules with mixed procedural selectors and pseudo-elements via fallback split", () => {
      const css = `
        body:has(#popup), .card::before {
          background-color: #ff0000;
        }
      `;
      const rules = compileCssToUbolRules(css, "example.com");
      expect(rules).toHaveLength(2);
      expect(rules[0]).toBe(
        "example.com##body:has(#popup):style(background-color: #ff0000)",
      );
      expect(rules[1]).toBe(
        "example.com##.card::before:style(background-color: #ff0000)",
      );
      for (const r of rules) validateRuleWithUbo(r);
    });

    it("compiles comma-separated selectors containing :is() with commas into individual :style rules", () => {
      const css = `
        :is(code, kbd, pre, samp), #read-only-cursor-text-area, .react-code-text, .text-mono, .blob-code-inner {
          font-family: var(--stylus-font-monospace);
        }
      `;
      const rules = compileCssToUbolRules(css, "github.com");
      expect(rules).toEqual([
        "github.com##:is(code, kbd, pre, samp):style(font-family: var(--stylus-font-monospace))",
        "github.com###read-only-cursor-text-area:style(font-family: var(--stylus-font-monospace))",
        "github.com##.react-code-text:style(font-family: var(--stylus-font-monospace))",
        "github.com##.text-mono:style(font-family: var(--stylus-font-monospace))",
        "github.com##.blob-code-inner:style(font-family: var(--stylus-font-monospace))",
      ]);
      for (const r of rules) validateRuleWithUbo(r);
    });

    it("compiles filter statements in dark media queries to :matches-media without invalid light-dark()", () => {
      const css = `
        @media (prefers-color-scheme: dark) {
          img {
            filter: invert(1);
            -webkit-filter: invert(1);
          }
        }
      `;
      const rules = compileCssToUbolRules(css, "example.com");
      expect(rules.some((r) => r.includes("light-dark"))).toBe(false);
      expect(rules).toContain(
        "example.com##img:matches-media((prefers-color-scheme: dark)):style(filter: invert(1); -webkit-filter: invert(1))",
      );
      for (const r of rules) validateRuleWithUbo(r);
    });

    it("handles comma-separated selectors with filter in dark media by emitting individual :matches-media rules", () => {
      const css = `
        @media (prefers-color-scheme: dark) {
          img, svg, video {
            filter: invert(1);
          }
        }
      `;
      const rules = compileCssToUbolRules(css, "example.com");
      expect(rules).toEqual([
        "example.com##img:matches-media((prefers-color-scheme: dark)):style(filter: invert(1))",
        "example.com##svg:matches-media((prefers-color-scheme: dark)):style(filter: invert(1))",
        "example.com##video:matches-media((prefers-color-scheme: dark)):style(filter: invert(1))",
      ]);
      for (const r of rules) validateRuleWithUbo(r);
    });

    it("compiles base filter and dark filter into separate unconditional and :matches-media rules", () => {
      const css = `
        img {
          filter: grayscale(1);
        }
        @media (prefers-color-scheme: dark) {
          img {
            filter: invert(1);
          }
        }
      `;
      const rules = compileCssToUbolRules(css, "example.com");
      expect(rules).toEqual([
        "example.com##img:style(filter: grayscale(1))",
        "example.com##img:matches-media((prefers-color-scheme: dark)):style(filter: invert(1))",
      ]);
      for (const r of rules) validateRuleWithUbo(r);
    });

    it("compiles base color and dark color into synthesized light-dark rule with color-scheme", () => {
      const css = `
        img {
          background-color: #ffffff;
        }
        @media (prefers-color-scheme: dark) {
          img {
            background-color: #000000;
          }
        }
      `;
      const rules = compileCssToUbolRules(css, "example.com");
      expect(rules).toEqual([
        "example.com##:root:style(color-scheme: light dark !important)",
        "example.com##img:style(background-color: light-dark(#ffffff, #000000))",
      ]);
      for (const r of rules) validateRuleWithUbo(r);
    });

    it("compiles display: none in light media query into :matches-media((prefers-color-scheme: light)):style(display: none !important)", () => {
      const css = `
        @media (prefers-color-scheme: light) {
          .ad-banner {
            display: none !important;
          }
        }
      `;
      const rules = compileCssToUbolRules(css, "example.com");
      expect(rules).toEqual([
        "example.com##.ad-banner:matches-media((prefers-color-scheme: light)):style(display: none !important)",
      ]);
      for (const r of rules) validateRuleWithUbo(r);
    });

    it("compiles pure display: none across both light and dark media queries into cosmetic hide rules", () => {
      const css = `
        @media (prefers-color-scheme: light) {
          .ad-banner {
            display: none;
          }
        }
        @media (prefers-color-scheme: dark) {
          .ad-banner {
            display: none;
          }
        }
      `;
      const rules = compileCssToUbolRules(css, "example.com");
      expect(rules).toEqual(["example.com##.ad-banner"]);
      for (const r of rules) validateRuleWithUbo(r);
    });

    it("compiles light-only styles into :matches-media((prefers-color-scheme: light)):style(...)", () => {
      const css = `
        @media (prefers-color-scheme: light) {
          .notice {
            background-color: #f9f9f9;
            opacity: 0.95;
          }
        }
      `;
      const rules = compileCssToUbolRules(css, "example.com");
      expect(rules).toEqual([
        "example.com##.notice:matches-media((prefers-color-scheme: light)):style(background-color: #f9f9f9; opacity: 0.95)",
      ]);
      for (const r of rules) validateRuleWithUbo(r);
    });

    it("compiles base filter and light filter into separate unconditional and :matches-media rules", () => {
      const css = `
        img {
          filter: grayscale(1);
        }
        @media (prefers-color-scheme: light) {
          img {
            filter: contrast(1.2);
          }
        }
      `;
      const rules = compileCssToUbolRules(css, "example.com");
      expect(rules).toEqual([
        "example.com##img:style(filter: grayscale(1))",
        "example.com##img:matches-media((prefers-color-scheme: light)):style(filter: contrast(1.2))",
      ]);
      for (const r of rules) validateRuleWithUbo(r);
    });
  });
});
