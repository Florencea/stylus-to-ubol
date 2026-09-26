import { describe, expect, it } from "vitest";
import { AstFilterParser } from "@gorhill/ubo-core/js/static-filtering-parser.js";
import {
  compileCssToUbolRules,
  normalizeSelector,
  parseUbolToCss,
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

  describe("parseUbolToCss", () => {
    it("parses cosmetic hide rules into CSS with display: none !important", () => {
      const filters = `
        example.com##.ad-banner, #sidebar
        example.com##.popup
      `;
      const css = parseUbolToCss(filters, "example.com", "desktop");
      expect(css).toContain(
        ".ad-banner, #sidebar {\n  display: none !important;\n}",
      );
      expect(css).toContain(".popup {\n  display: none !important;\n}");
    });

    it("parses style injection rules into CSS preserving declarations", () => {
      const filters = `
        example.com##.content:style(color: light-dark(#000, #fff) !important; background: #fff !important;)
      `;
      const css = parseUbolToCss(filters, "example.com", "desktop");
      expect(css).toContain(
        ".content {\n  color: light-dark(#000, #fff) !important;\n  background: #fff !important;\n}",
      );
    });

    it("handles complex selectors with pseudo-classes like :has and :not before :style", () => {
      const filters = `
        example.com##article:not(.featured):has(> .badge):style(opacity: 0.8 !important;)
      `;
      const css = parseUbolToCss(filters, "example.com", "desktop");
      expect(css).toContain(
        "article:not(.featured):has(> .badge) {\n  opacity: 0.8 !important;\n}",
      );
    });

    it("handles domain matching: exact, subdomain, negation, and multiple domains", () => {
      const filters = `
        example.com##.hide-on-example
        sub.example.com##.hide-on-sub
        example.com,~bad.example.com##.hide-except-bad
        other.com##.hide-on-other
        foo.com,bar.com##.hide-multi
        ##.hide-generic
      `;

      // Matching sub.example.com: matches example.com (subdomain), sub.example.com, and generic
      const subCss = parseUbolToCss(filters, "sub.example.com", "desktop");
      expect(subCss).toContain(".hide-on-example");
      expect(subCss).toContain(".hide-on-sub");
      expect(subCss).toContain(".hide-except-bad");
      expect(subCss).toContain(".hide-generic");
      expect(subCss).not.toContain(".hide-on-other");
      expect(subCss).not.toContain(".hide-multi");

      // Negated domain test: bad.example.com matches example.com, but is excluded by ~bad.example.com
      const badCss = parseUbolToCss(filters, "bad.example.com", "desktop");
      expect(badCss).not.toContain(".hide-except-bad");

      // Multiple domain test: foo.com matches .hide-multi
      const fooCss = parseUbolToCss(filters, "foo.com", "desktop");
      expect(fooCss).toContain(".hide-multi");
    });

    it("handles platform preprocessor directives (!#if env_mobile / !#else / !#endif)", () => {
      const filters = `
        example.com##.desktop-always
        !#if env_mobile
        example.com##.mobile-only
        !#else
        example.com##.desktop-only
        !#endif
        !#if !env_mobile
        example.com##.not-mobile
        !#endif
      `;

      const desktopCss = parseUbolToCss(filters, "example.com", "desktop");
      expect(desktopCss).toContain(".desktop-always");
      expect(desktopCss).toContain(".desktop-only");
      expect(desktopCss).toContain(".not-mobile");
      expect(desktopCss).not.toContain(".mobile-only");

      const mobileCss = parseUbolToCss(filters, "example.com", "mobile");
      expect(mobileCss).toContain(".desktop-always");
      expect(mobileCss).toContain(".mobile-only");
      expect(mobileCss).not.toContain(".desktop-only");
      expect(mobileCss).not.toContain(".not-mobile");
    });

    it("ignores comments and invalid network filter lines", () => {
      const filters = `
        ! This is a comment
        # This is another comment
        ||adserver.com^$script
        @@||whitelist.com^
        
        example.com##.valid
      `;
      const css = parseUbolToCss(filters, "example.com", "desktop");
      expect(css).toBe(".valid {\n  display: none !important;\n}");
    });

    it("handles unclosed or malformed style syntax gracefully without crashing", () => {
      const filters = `
        example.com##.broken:style(color: red
        example.com##.valid
      `;
      const css = parseUbolToCss(filters, "example.com", "desktop");
      expect(css).toContain(".valid");
    });

    it("handles empty selectors, trailing style junk, and negated-only domains", () => {
      const filters = `
        example.com##
        example.com##:style(color: red;)
        example.com##.foo:style(color: red;) trailing_junk
        ~other.com##.only-negated-domain
        example.com##.sub-neg-match
        ~bad.com##.sub-neg-match
        !#if ext_unknown
        example.com##.unknown-feature
        !#endif
      `;
      const css = parseUbolToCss(filters, "example.com", "desktop");
      expect(css).toContain(".only-negated-domain");
      expect(css).toContain(".sub-neg-match");
      expect(css).not.toContain(".unknown-feature");
      expect(css).not.toContain("trailing_junk");

      // Test subdomain of negated domain
      const badSubCss = parseUbolToCss(filters, "sub.bad.com", "desktop");
      expect(badSubCss).not.toContain(".sub-neg-match");
    });
  });

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
        "example.com##.ad-banner, #sidebar",
        "example.com##.ad-footer",
      ]);
      for (const r of rules) validateRuleWithUbo(r);
    });

    it("compiles general CSS rules into :style(...) rules with enforced !important", () => {
      const css = `
        .btn-primary {
          background-color: #007bff;
          border-radius: 4px !important;
        }
      `;
      const rules = compileCssToUbolRules(css, "example.com");
      expect(rules).toEqual([
        "example.com##.btn-primary:style(background-color: #007bff !important; border-radius: 4px !important;)",
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
      expect(cardRule).toContain(
        "background: light-dark(#ffffff, #1e1e1e) !important;",
      );
      expect(cardRule).toContain(
        "color: light-dark(#333333, #ffffff) !important;",
      );
      // Same value in both light and dark -> plain value with !important
      expect(cardRule).toContain("font-size: 14px !important;");
      // Light-only property
      expect(cardRule).toContain("border-color: #e0e0e0 !important;");
      // Dark-only property -> light-dark(initial, val)
      expect(cardRule).toContain(
        "box-shadow: light-dark(initial, 0 0 10px #000) !important;",
      );

      // Root rule should contain color-scheme
      const rootRule = rules.find((r) => r.includes("##:root:style"));
      expect(rootRule).toBeDefined();
      expect(rootRule).toContain("color-scheme: light dark !important;");
      expect(rootRule).toContain("--header-bg: #fff !important;");

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

    it("rejects unsupported @media queries (e.g. min-width)", () => {
      const css = `
        @media (min-width: 768px) {
          .nav { display: flex; }
        }
      `;
      expect(() => compileCssToUbolRules(css, "example.com")).toThrow(
        /Unsupported @media query/,
      );
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
        "example.com##.modal:style(display: none !important; opacity: 0 !important;)",
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
        "example.com##body:has(#popup):style(background-color: #ff0000 !important;)",
      );
      expect(rules[1]).toBe(
        "example.com##.card::before:style(background-color: #ff0000 !important;)",
      );
      for (const r of rules) validateRuleWithUbo(r);
    });
  });
});
