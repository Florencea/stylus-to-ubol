import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildUboRules,
  compileStylus,
  computeConfigStats,
  CssParseError,
  parseUbolBaseConfig,
  serializeDeclaration,
  splitSelectorAndPseudoElement,
  ValidationError,
} from "../src/compiler.js";
import { parseCss } from "../src/css-parser.js";

describe("Compiler Engine", () => {
  describe("serializeDeclaration", () => {
    it("serializes declaration without !important when not present", () => {
      const ast = parseCss("div { color: red; }");
      assert.equal(ast.type, "StyleSheet");
      const rule = ast.body[0];
      assert.equal(rule?.type, "Rule");
      const decl = rule.declarations[0];
      assert.equal(decl?.type, "Declaration");
      const serialized = serializeDeclaration(decl);
      assert.equal(serialized, "color:red");
    });

    it("serializes declaration with !important when present", () => {
      const ast = parseCss("div { color: red !important; }");
      assert.equal(ast.type, "StyleSheet");
      const rule = ast.body[0];
      assert.equal(rule?.type, "Rule");
      const decl = rule.declarations[0];
      assert.equal(decl?.type, "Declaration");
      const serialized = serializeDeclaration(decl);
      assert.equal(serialized, "color:red !important");
    });

    it("throws ValidationError on invalid declaration node", () => {
      assert.throws(() => serializeDeclaration(null), ValidationError);
      assert.throws(
        () => serializeDeclaration({ type: "Rule", property: "color" }),
        ValidationError,
      );
    });
  });

  describe("splitSelectorAndPseudoElement", () => {
    it("splits standard pseudo-elements from base selector", () => {
      const ast = parseCss(".header::before { content: ''; }");
      assert.equal(ast.type, "StyleSheet");
      const rule = ast.body[0];
      assert.equal(rule?.type, "Rule");
      const sel = rule.selectors[0];
      assert.equal(sel?.type, "Selector");
      const { baseSelector, pseudoElement } =
        splitSelectorAndPseudoElement(sel);
      assert.equal(baseSelector, ".header");
      assert.equal(pseudoElement, "::before");
    });

    it("splits single-colon pseudo-classes acting as pseudo-elements", () => {
      const ast = parseCss(".btn:after { content: ''; }");
      assert.equal(ast.type, "StyleSheet");
      const rule = ast.body[0];
      assert.equal(rule?.type, "Rule");
      const sel = rule.selectors[0];
      assert.equal(sel?.type, "Selector");
      const { baseSelector, pseudoElement } =
        splitSelectorAndPseudoElement(sel);
      assert.equal(baseSelector, ".btn");
      assert.equal(pseudoElement, ":after");
    });

    it("throws ValidationError on invalid selector node", () => {
      assert.throws(() => splitSelectorAndPseudoElement(null), ValidationError);
      assert.throws(
        () =>
          splitSelectorAndPseudoElement({
            type: "Selector",
            raw: 123,
          }),
        ValidationError,
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
        "example.com##.nav::before:style(content:'>')",
      ]);
    });

    it("throws ValidationError on invalid rules or baseConfig types", () => {
      assert.throws(() => buildUboRules("not-an-array"), ValidationError);
      assert.throws(
        () => buildUboRules([{ domain: 123, code: "" }]),
        ValidationError,
      );
      assert.throws(
        () =>
          buildUboRules(
            [{ domain: "example.com", code: "" }],
            ["invalid-array-base"],
          ),
        ValidationError,
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

    it("throws ValidationError when config shape is invalid", () => {
      assert.throws(() => computeConfigStats(null), ValidationError);
      assert.throws(
        () =>
          computeConfigStats({ customFilters: "invalid", sandboxFilters: [] }),
        ValidationError,
      );
    });
  });

  describe("parseUbolBaseConfig", () => {
    it("throws ValidationError on non-string input", () => {
      assert.throws(() => parseUbolBaseConfig(null), ValidationError);
      assert.throws(() => parseUbolBaseConfig(123), ValidationError);
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

    it("collects CSS parse errors across multiple styles with line numbers", () => {
      const brokenStylus = JSON.stringify([
        { settings: {} },
        {
          name: "Header Tweak",
          sections: [
            {
              domains: ["a.example", "b.example"],
              code: ".header {\n  color red;\n}",
            },
          ],
        },
        {
          name: "Animations",
          sections: [
            {
              domains: ["c.example"],
              code: "@keyframes spin {\n  from { opacity: 0; }\n}",
            },
          ],
        },
      ]);

      assert.throws(
        () => compileStylus(brokenStylus),
        (err) => {
          assert.ok(err instanceof CssParseError);
          // Multi-domain section error is deduplicated once, plus @keyframes error
          assert.equal(err.issues.length, 2);
          assert.match(err.message, /style "Header Tweak"/);
          assert.match(err.message, /line 2, column 3/);
          assert.match(err.message, /style "Animations"/);
          assert.match(err.message, /@keyframes/);
          return true;
        },
      );
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

    it("throws ValidationError on non-string rawText and rejects invalid baseConfigInput", () => {
      assert.throws(() => compileStylus(null), ValidationError);
      assert.throws(() => compileStylus(42), ValidationError);
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
