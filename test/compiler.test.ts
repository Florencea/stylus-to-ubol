import { parse } from "css-tree";
import { assert, describe, expect, it } from "vite-plus/test";
import {
  buildUboRules,
  compileStylus,
  computeConfigStats,
  serializeDeclaration,
  splitSelectorAndPseudoElement,
  type UbolConfig,
} from "../src/compiler.ts";

describe("Compiler Engine", () => {
  describe("serializeDeclaration", () => {
    it("serializes declaration without !important when not present", () => {
      const ast = parse("div { color: red; }");
      assert(ast.type === "StyleSheet");
      const rule = ast.children.first;
      assert(rule?.type === "Rule");
      const decl = rule.block.children.first;
      assert(decl?.type === "Declaration");
      const serialized = serializeDeclaration(decl);
      expect(serialized).toBe("color:red");
    });

    it("serializes declaration with !important when present", () => {
      const ast = parse("div { color: red !important; }");
      assert(ast.type === "StyleSheet");
      const rule = ast.children.first;
      assert(rule?.type === "Rule");
      const decl = rule.block.children.first;
      assert(decl?.type === "Declaration");
      const serialized = serializeDeclaration(decl);
      expect(serialized).toBe("color:red !important");
    });
  });

  describe("splitSelectorAndPseudoElement", () => {
    it("splits standard pseudo-elements from base selector", () => {
      const ast = parse(".header::before { content: ''; }");
      assert(ast.type === "StyleSheet");
      const rule = ast.children.first;
      assert(rule?.type === "Rule");
      assert(rule.prelude.type === "SelectorList");
      const sel = rule.prelude.children.first;
      assert(sel?.type === "Selector");
      const { baseSelector, pseudoElement } = splitSelectorAndPseudoElement(sel);
      expect(baseSelector).toBe(".header");
      expect(pseudoElement).toBe("::before");
    });

    it("splits single-colon pseudo-classes acting as pseudo-elements", () => {
      const ast = parse(".btn:after { content: ''; }");
      assert(ast.type === "StyleSheet");
      const rule = ast.children.first;
      assert(rule?.type === "Rule");
      assert(rule.prelude.type === "SelectorList");
      const sel = rule.prelude.children.first;
      assert(sel?.type === "Selector");
      const { baseSelector, pseudoElement } = splitSelectorAndPseudoElement(sel);
      expect(baseSelector).toBe(".btn");
      expect(pseudoElement).toBe(":after");
    });
  });

  describe("buildUboRules", () => {
    it("routes display:none !important to customFilters", () => {
      const rules = [
        {
          domain: "example.com",
          code: ".ad { display: none !important; }",
        },
      ];
      const config = buildUboRules(rules);
      expect(config.customFilters).toEqual([["example.com", [".ad"]]]);
      expect(config.sandboxFilters).toEqual([]);
    });

    it("routes other declarations to sandboxFilters", () => {
      const rules = [
        {
          domain: "example.com",
          code: ".header { background-color: #333 !important; }",
        },
      ];
      const config = buildUboRules(rules);
      expect(config.customFilters).toEqual([]);
      expect(config.sandboxFilters).toEqual([
        "example.com##.header:style(background-color:#333 !important)",
      ]);
    });

    it("appends :matches-media for rules inside @media", () => {
      const rules = [
        {
          domain: "example.com",
          code: "@media (max-width: 768px) { .sidebar { opacity: 0; } }",
        },
      ];
      const config = buildUboRules(rules);
      expect(config.sandboxFilters).toEqual([
        "example.com##.sidebar:matches-media((max-width:768px)):style(opacity:0)",
      ]);
    });

    it("keeps display:none under pointer:coarse inside sandboxFilters", () => {
      const rules = [
        {
          domain: "example.com",
          code: "@media (pointer: coarse) { .banner { display: none !important; } }",
        },
      ];
      const config = buildUboRules(rules);
      expect(config.customFilters).toEqual([]);
      expect(config.sandboxFilters).toEqual([
        "example.com##.banner:matches-media((pointer:coarse)):style(display:none !important)",
      ]);
    });

    it("inserts :matches-media before pseudo-element", () => {
      const rules = [
        {
          domain: "example.com",
          code: "@media (min-width: 1024px) { .nav::before { content: '>'; } }",
        },
      ];
      const config = buildUboRules(rules);
      expect(config.sandboxFilters).toEqual(['example.com##.nav::before:style(content:">")']);
    });
  });

  describe("computeConfigStats", () => {
    it("computes stats accurately from UbolConfig", () => {
      const config: UbolConfig = {
        version: "2026.920.1710",
        filteringModes: {
          none: [],
          basic: [],
          optimal: ["all-urls"],
          complete: [],
        },
        customFilters: [
          ["example.com", [".ad1", ".ad2"]],
          ["foo.com", [".sidebar"]],
        ],
        sandboxFilters: [
          "example.com##.btn:style(color: red !important;)",
          "bar.com##.header:style(opacity: 0 !important;)",
        ],
      };

      const stats = computeConfigStats(config);
      // Domains: example.com, foo.com, bar.com -> 3
      expect(stats.domainCount).toBe(3);
      // Hide rules: 2 + 1 -> 3
      expect(stats.hideRuleCount).toBe(3);
      // Style rules: 2
      expect(stats.styleRuleCount).toBe(2);
    });
  });

  describe("compileStylus", () => {
    it("converts Stylus JSON string and returns config with stats", () => {
      const rawStylus = JSON.stringify([
        {
          settings: {},
        },
        {
          id: 1,
          name: "My Style",
          enabled: true,
          installDate: 123456,
          sections: [
            {
              domains: ["site.com"],
              code: `
                .desktop-ad { display: none !important; }
                @media (pointer: coarse) {
                  .mobile-ad { display: none !important; }
                }
              `,
            },
          ],
        },
      ]);

      const result = compileStylus(rawStylus);

      expect(result.config).toBeDefined();
      expect(result.config.version).toBe("2026.920.1710");
      expect(result.config.customFilters).toEqual([["site.com", [".desktop-ad"]]]);
      expect(result.config.sandboxFilters).toEqual([
        "site.com##.mobile-ad:matches-media((pointer:coarse)):style(display:none !important)",
      ]);

      expect(result.stats.domainCount).toBe(1);
      expect(result.stats.hideRuleCount).toBe(1);
      expect(result.stats.styleRuleCount).toBe(1);
    });

    it("throws clear error on malformed JSON or empty text", () => {
      expect(() => compileStylus("")).toThrow(/Uploaded file is empty/);
      expect(() => compileStylus("not a json")).toThrow(/Failed to parse JSON/);
    });

    it("throws clear error on invalid structure without sections", () => {
      expect(() => compileStylus(JSON.stringify([{ invalid: "data" }]))).toThrow(
        /Invalid Stylus JSON/,
      );
    });
  });
});
