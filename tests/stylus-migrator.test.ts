import { describe, expect, it } from "vitest";
import { AstFilterParser } from "@gorhill/ubo-core/js/static-filtering-parser.js";
import {
  migrateStylusJson,
  parseStylusSection,
} from "../src/core/stylus-migrator.ts";
import { UbolBackupSchema } from "../src/core/schema.ts";

describe("Stylus Migrator", () => {
  const uboParser = new AstFilterParser();

  const validateRuleWithUbo = (rule: string) => {
    uboParser.parse(rule);
    expect(uboParser.hasError(), `Rule had error: ${rule}`).toBe(false);
    expect(uboParser.isCosmeticFilter(), `Rule was not cosmetic: ${rule}`).toBe(
      true,
    );
  };

  it("correctly splits pure cosmetic hide rules (display: none)", () => {
    const css = `
      .ad-banner, #sidebar {
        display: none !important;
      }
      .popup {
        display: none;
      }
    `;
    const result = parseStylusSection(css, ["example.com"]);
    expect(result.cosmeticRules).toEqual([
      "example.com##.ad-banner, #sidebar",
      "example.com##.popup",
    ]);
    expect(result.styleRules).toHaveLength(0);

    for (const rule of result.cosmeticRules) {
      validateRuleWithUbo(rule);
    }
  });

  it("correctly formats style injection rules with enforced !important", () => {
    const css = `
      .header {
        background-color: #f5f5f5;
        font-size: 14px !important;
      }
    `;
    const result = parseStylusSection(css, ["example.com"]);
    expect(result.cosmeticRules).toHaveLength(0);
    const firstRule = result.styleRules[0];
    expect(firstRule).toBeDefined();
    if (firstRule) {
      validateRuleWithUbo(firstRule);
    }
  });

  it("merges prefers-color-scheme: dark with light attributes into light-dark(...) and color-scheme", () => {
    const css = `
      .content {
        color: #111111;
        background: #ffffff;
      }
      @media (prefers-color-scheme: dark) {
        .content {
          color: #eeeeee;
          background: #222222;
        }
      }
    `;
    const result = parseStylusSection(css, ["example.com"]);
    expect(result.cosmeticRules).toHaveLength(0);

    // Strict rule: No @media allowed in uBOL output
    for (const rule of result.styleRules) {
      expect(rule).not.toContain("@media");
      validateRuleWithUbo(rule);
    }

    const contentRule = result.styleRules.find((r) => r.includes(".content"));
    expect(contentRule).toBeDefined();
    expect(contentRule).toContain(
      "color: light-dark(#111111, #eeeeee) !important;",
    );
    expect(contentRule).toContain(
      "background: light-dark(#ffffff, #222222) !important;",
    );

    // Must include color-scheme: light dark !important;
    const hasColorScheme = result.styleRules.some((r) =>
      r.includes("color-scheme: light dark !important;"),
    );
    expect(hasColorScheme).toBe(true);
  });

  it("handles extreme case 1: multi-level parentheses (calc, gradients, color functions)", () => {
    const css = `
      .hero {
        background: linear-gradient(180deg, rgba(0, 0, 0, 0.8), rgba(255, 255, 255, 0.2));
        width: calc(100% - (2 * var(--gutter, 16px)));
      }
      @media (prefers-color-scheme: dark) {
        .hero {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(0, 0, 0, 0.9));
        }
      }
    `;
    const result = parseStylusSection(css, ["example.com"]);
    const heroRule = result.styleRules.find((r) => r.includes(".hero"));
    expect(heroRule).toBeDefined();

    expect(heroRule).toContain(
      "background: light-dark(linear-gradient(180deg, rgba(0, 0, 0, 0.8), rgba(255, 255, 255, 0.2)), linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(0, 0, 0, 0.9))) !important;",
    );
    expect(heroRule).toContain(
      "width: calc(100% - (2 * var(--gutter, 16px))) !important;",
    );

    for (const rule of result.styleRules) {
      validateRuleWithUbo(rule);
    }
  });

  it("handles extreme case 2: CSS custom properties (variables)", () => {
    const css = `
      :root {
        --text-color: #24292f;
        --bg-color: #ffffff;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --text-color: #c9d1d9;
          --bg-color: #0d1117;
        }
      }
    `;
    const result = parseStylusSection(css, ["github.com"]);
    const rootRule = result.styleRules.find((r) => r.includes(":root"));
    expect(rootRule).toBeDefined();

    expect(rootRule).toContain(
      "--text-color: light-dark(#24292f, #c9d1d9) !important;",
    );
    expect(rootRule).toContain(
      "--bg-color: light-dark(#ffffff, #0d1117) !important;",
    );
    expect(rootRule).toContain("color-scheme: light dark !important;");

    if (rootRule) {
      validateRuleWithUbo(rootRule);
    }
  });

  it("handles extreme case 3: nested selectors and nested media queries", () => {
    const css = `
      .card {
        background: #ffffff;
        & .title {
          color: #111111;
        }
        @media (prefers-color-scheme: dark) {
          background: #1a1a1a;
          & .title {
            color: #f0f0f0;
          }
        }
      }
    `;
    const result = parseStylusSection(css, ["example.com"]);
    const cardRule = result.styleRules.find((r) => r.includes("##.card:style"));
    const titleRule = result.styleRules.find((r) =>
      r.includes("##.card .title:style"),
    );

    expect(cardRule).toBeDefined();
    expect(cardRule).toContain(
      "background: light-dark(#ffffff, #1a1a1a) !important;",
    );

    expect(titleRule).toBeDefined();
    expect(titleRule).toContain(
      "color: light-dark(#111111, #f0f0f0) !important;",
    );

    for (const rule of result.styleRules) {
      validateRuleWithUbo(rule);
    }
  });

  it("migrates full Stylus JSON export conforming to UbolBackupSchema", () => {
    const stylusBackup = [
      {
        id: 1,
        name: "GitHub Clean & Dark",
        enabled: true,
        sections: [
          {
            code: `
              .feed-left, #dashboard-sidebar {
                display: none !important;
              }
              body {
                background: #ffffff;
                color: #24292f;
              }
              @media (prefers-color-scheme: dark) {
                body {
                  background: #0d1117;
                  color: #c9d1d9;
                }
              }
            `,
            domains: ["github.com", "gist.github.com"],
          },
        ],
      },
    ];

    const ubolBackup = migrateStylusJson(JSON.stringify(stylusBackup));

    // Validate schema
    const parsed = UbolBackupSchema.parse(ubolBackup);
    expect(parsed.schemaVersion).toBe(1);

    const filterLines = parsed.userResources.userFilters.split("\n");
    expect(filterLines.length).toBeGreaterThan(0);

    // Verify each line is valid uBO syntax
    for (const line of filterLines) {
      if (line.trim().length === 0 || line.startsWith("!")) continue;
      validateRuleWithUbo(line);
    }

    // Verify multi-domain prefix
    expect(
      filterLines.some((l) =>
        l.startsWith(
          "github.com,gist.github.com##.feed-left, #dashboard-sidebar",
        ),
      ),
    ).toBe(true);

    expect(
      filterLines.some(
        (l) =>
          l.startsWith("github.com,gist.github.com##body:style") &&
          l.includes("light-dark") &&
          l.includes("!important"),
      ),
    ).toBe(true);
  });
});
