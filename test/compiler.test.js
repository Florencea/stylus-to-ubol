import parse from "css-tree/parser";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ZodError } from "zod";
import {
  buildUboRules,
  compileStylus,
  computeConfigStats,
  parseUbolBaseConfig,
  serializeDeclaration,
  splitSelectorAndPseudoElement,
} from "../src/compiler.js";

describe("Compiler Engine", () => {
  describe("serializeDeclaration", () => {
    it("serializes declaration without !important when not present", () => {
      const ast = parse("div { color: red; }");
      assert.equal(ast.type, "StyleSheet");
      const rule = ast.children.first;
      assert.equal(rule?.type, "Rule");
      const decl = rule.block.children.first;
      assert.equal(decl?.type, "Declaration");
      const serialized = serializeDeclaration(decl);
      assert.equal(serialized, "color:red");
    });

    it("serializes declaration with !important when present", () => {
      const ast = parse("div { color: red !important; }");
      assert.equal(ast.type, "StyleSheet");
      const rule = ast.children.first;
      assert.equal(rule?.type, "Rule");
      const decl = rule.block.children.first;
      assert.equal(decl?.type, "Declaration");
      const serialized = serializeDeclaration(decl);
      assert.equal(serialized, "color:red !important");
    });

    it("throws ZodError on invalid declaration node", () => {
      assert.throws(() => serializeDeclaration(null), ZodError);
      assert.throws(
        () => serializeDeclaration({ type: "Rule", property: "color" }),
        ZodError,
      );
    });
  });

  describe("splitSelectorAndPseudoElement", () => {
    it("splits standard pseudo-elements from base selector", () => {
      const ast = parse(".header::before { content: ''; }");
      assert.equal(ast.type, "StyleSheet");
      const rule = ast.children.first;
      assert.equal(rule?.type, "Rule");
      assert.equal(rule.prelude.type, "SelectorList");
      const sel = rule.prelude.children.first;
      assert.equal(sel?.type, "Selector");
      const { baseSelector, pseudoElement } =
        splitSelectorAndPseudoElement(sel);
      assert.equal(baseSelector, ".header");
      assert.equal(pseudoElement, "::before");
    });

    it("splits single-colon pseudo-classes acting as pseudo-elements", () => {
      const ast = parse(".btn:after { content: ''; }");
      assert.equal(ast.type, "StyleSheet");
      const rule = ast.children.first;
      assert.equal(rule?.type, "Rule");
      assert.equal(rule.prelude.type, "SelectorList");
      const sel = rule.prelude.children.first;
      assert.equal(sel?.type, "Selector");
      const { baseSelector, pseudoElement } =
        splitSelectorAndPseudoElement(sel);
      assert.equal(baseSelector, ".btn");
      assert.equal(pseudoElement, ":after");
    });

    it("throws ZodError on invalid selector node", () => {
      assert.throws(() => splitSelectorAndPseudoElement(null), ZodError);
      assert.throws(
        () =>
          splitSelectorAndPseudoElement({
            type: "Selector",
            children: 123,
          }),
        ZodError,
      );
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
      assert.deepEqual(config.customFilters, [["example.com", [".ad"]]]);
      assert.deepEqual(config.sandboxFilters, []);
    });

    it("routes other declarations to sandboxFilters", () => {
      const rules = [
        {
          domain: "example.com",
          code: ".header { background-color: #333 !important; }",
        },
      ];
      const config = buildUboRules(rules);
      assert.deepEqual(config.customFilters, []);
      assert.deepEqual(config.sandboxFilters, [
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
      assert.deepEqual(config.sandboxFilters, [
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
      assert.deepEqual(config.customFilters, []);
      assert.deepEqual(config.sandboxFilters, [
        "example.com##.banner:matches-media((pointer:coarse)):style(display:none !important)",
      ]);
    });

    it("omits :matches-media when pseudo-element is present", () => {
      const rules = [
        {
          domain: "example.com",
          code: "@media (min-width: 1024px) { .nav::before { content: '>'; } }",
        },
      ];
      const config = buildUboRules(rules);
      assert.deepEqual(config.sandboxFilters, [
        'example.com##.nav::before:style(content:">")',
      ]);
    });

    it("throws ZodError on invalid rules or baseConfig types", () => {
      assert.throws(() => buildUboRules("not-an-array"), ZodError);
      assert.throws(() => buildUboRules([{ domain: 123, code: "" }]), ZodError);
      assert.throws(
        () =>
          buildUboRules(
            [{ domain: "example.com", code: "" }],
            ["invalid-array-base"],
          ),
        ZodError,
      );
    });
  });

  describe("computeConfigStats", () => {
    it("computes stats accurately from UbolConfig", () => {
      const config = {
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
      assert.equal(stats.domainCount, 3);
      assert.equal(stats.hideRuleCount, 3);
      assert.equal(stats.styleRuleCount, 2);
    });

    it("throws ZodError when config shape is invalid", () => {
      assert.throws(() => computeConfigStats(null), ZodError);
      assert.throws(
        () =>
          computeConfigStats({ customFilters: "invalid", sandboxFilters: [] }),
        ZodError,
      );
    });
  });

  describe("parseUbolBaseConfig", () => {
    it("throws ZodError on non-string input", () => {
      assert.throws(() => parseUbolBaseConfig(null), ZodError);
      assert.throws(() => parseUbolBaseConfig(123), ZodError);
    });

    it("rejects non-object JSON base configs", () => {
      assert.throws(
        () => parseUbolBaseConfig("[]"),
        /Expected a JSON object configuration/,
      );
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

      assert.ok(result.config);
      assert.equal(result.config.version, "2026.920.1710");
      assert.deepEqual(result.config.customFilters, [
        ["site.com", [".desktop-ad"]],
      ]);
      assert.deepEqual(result.config.sandboxFilters, [
        "site.com##.mobile-ad:matches-media((pointer:coarse)):style(display:none !important)",
      ]);

      assert.equal(result.stats.domainCount, 1);
      assert.equal(result.stats.hideRuleCount, 1);
      assert.equal(result.stats.styleRuleCount, 1);
    });

    it("throws clear error on malformed JSON or empty text", () => {
      assert.throws(() => compileStylus(""), /Uploaded file is empty/);
      assert.throws(() => compileStylus("not a json"), /Failed to parse JSON/);
    });

    it("throws clear error on invalid structure without sections", () => {
      assert.throws(
        () => compileStylus(JSON.stringify([{ invalid: "data" }])),
        /Invalid Stylus JSON/,
      );
    });

    it("throws ZodError on non-string rawText and rejects invalid baseConfigInput", () => {
      assert.throws(() => compileStylus(null), ZodError);
      assert.throws(() => compileStylus(42), ZodError);
      const validStylus = JSON.stringify([
        { sections: [{ domains: ["site.com"], code: ".a { color: red; }" }] },
      ]);
      assert.throws(
        () => compileStylus(validStylus, ["invalid-base"]),
        /Expected a JSON object configuration/,
      );
    });
  });
});
