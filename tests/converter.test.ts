import { describe, expect, it } from "vitest";
import {
  buildUboRules,
  serializeDeclaration,
  splitSelectorAndPseudoElement,
} from "../src/converter.ts";
import { parse } from "css-tree";

describe("Converter", () => {
  describe("serializeDeclaration", () => {
    it("serializes declaration without !important when not present", () => {
      const ast = parse("div { color: red; }");
      let serialized = "";
      if (ast.type === "StyleSheet" && ast.children.first?.type === "Rule") {
        const block = ast.children.first.block;
        if (block.children.first?.type === "Declaration") {
          serialized = serializeDeclaration(block.children.first);
        }
      }
      expect(serialized).toBe("color:red");
    });

    it("serializes declaration with !important when present", () => {
      const ast = parse("div { color: red !important; }");
      let serialized = "";
      if (ast.type === "StyleSheet" && ast.children.first?.type === "Rule") {
        const block = ast.children.first.block;
        if (block.children.first?.type === "Declaration") {
          serialized = serializeDeclaration(block.children.first);
        }
      }
      expect(serialized).toBe("color:red !important");
    });
  });

  describe("splitSelectorAndPseudoElement", () => {
    it("splits standard pseudo-elements from base selector", () => {
      const ast = parse(".header::before { content: ''; }");
      if (
        ast.type === "StyleSheet" &&
        ast.children.first?.type === "Rule" &&
        ast.children.first.prelude.type === "SelectorList"
      ) {
        const sel = ast.children.first.prelude.children.first;
        if (sel?.type === "Selector") {
          const { baseSelector, pseudoElement } =
            splitSelectorAndPseudoElement(sel);
          expect(baseSelector).toBe(".header");
          expect(pseudoElement).toBe("::before");
        }
      }
    });

    it("splits single-colon pseudo-classes acting as pseudo-elements", () => {
      const ast = parse(".btn:after { content: ''; }");
      if (
        ast.type === "StyleSheet" &&
        ast.children.first?.type === "Rule" &&
        ast.children.first.prelude.type === "SelectorList"
      ) {
        const sel = ast.children.first.prelude.children.first;
        if (sel?.type === "Selector") {
          const { baseSelector, pseudoElement } =
            splitSelectorAndPseudoElement(sel);
          expect(baseSelector).toBe(".btn");
          expect(pseudoElement).toBe(":after");
        }
      }
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
      // Notice: when pseudoElement is present, effectiveMediaSuffix is empty as per algorithm
      expect(config.sandboxFilters).toEqual([
        'example.com##.nav::before:style(content:">")',
      ]);
    });
  });
});
