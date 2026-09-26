import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { AstFilterParser } from "@gorhill/ubo-core/js/static-filtering-parser.js";
import {
  migrateStylusJson,
  parseStylusSection,
} from "../src/core/stylus-migrator.ts";
import { runMigrateStylusCli } from "../src/cli/migrate-stylus.ts";
import {
  filterTextToUbolConfig,
  getFiltersFromBackup,
  isUbolConfig,
  UbolBackupSchema,
  UbolConfigSchema,
  ubolConfigToFilterText,
  type UbolConfig,
} from "../src/core/schema.ts";

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
    expect(isUbolConfig(parsed)).toBe(true);
    expect(UbolConfigSchema.parse(ubolBackup)).toBeDefined();
    expect(ubolBackup.customFilters).toBeDefined();
    expect(ubolBackup.filteringModes).toBeDefined();
    expect(ubolBackup.filteringModes?.optimal).toEqual(["all-urls"]);

    // Verify domains in customFilters
    const domainNames = ubolBackup.customFilters.map(([d]) => d);
    expect(domainNames).toContain("gist.github.com");
    expect(domainNames).toContain("github.com");

    const githubEntry = ubolBackup.customFilters.find(
      ([d]) => d === "github.com",
    );
    expect(githubEntry).toBeDefined();
    expect(githubEntry?.[1]).toContain(".feed-left");
    expect(githubEntry?.[1]).toContain("#dashboard-sidebar");

    // Verify ubolConfigToFilterText creates valid uBO cosmetic rules
    const filterLines = ubolConfigToFilterText(ubolBackup).split("\n");
    expect(filterLines.length).toBeGreaterThan(0);
    for (const line of filterLines) {
      validateRuleWithUbo(line);
    }
  });

  it("migrates legacy uBO backup (ubol-config-1.json format) to UbolConfig format", () => {
    const legacyBackup = {
      userResources: {
        userFilters: [
          "m.mobile01.com###_popIniFrame",
          "m.mobile01.com###share-bar",
          "vite.dev##.VPDocAside > :not(.VPDocAsideOutline)",
          "example.com##body:style(color: red !important;)",
        ].join("\n"),
      },
      schemaVersion: 1,
    };

    const result = migrateStylusJson(legacyBackup);
    expect(isUbolConfig(result)).toBe(true);
    expect(result.customFilters).toEqual([
      ["m.mobile01.com", ["#_popIniFrame", "#share-bar"]],
      ["vite.dev", [".VPDocAside > :not(.VPDocAsideOutline)"]],
    ]);
  });

  it("preserves all original settings outside customFilters when existingConfig is provided", () => {
    const existingConfig: UbolConfig & { customMeta: string } = {
      version: "2026.920.1710",
      filteringModes: {
        none: ["trusted.example"],
        basic: [],
        optimal: ["all-urls"],
        complete: ["strict.example"],
      },
      customFilters: [
        ["preserve.domain.com", [".keep-me"]],
        ["m.mobile01.com", [".old-banner"]],
      ],
      customMeta: "never-touch-this-value",
    };

    const stylusInput = [
      {
        enabled: true,
        sections: [
          {
            code: ".new-ad { display: none !important; }",
            domains: ["m.mobile01.com"],
          },
        ],
      },
    ];

    const result = migrateStylusJson(
      stylusInput,
      existingConfig,
    ) as UbolConfig & {
      customMeta: string;
    };

    // Areas outside customFilters MUST NOT be touched
    expect(result.version).toBe("2026.920.1710");
    expect(result.filteringModes).toEqual({
      none: ["trusted.example"],
      basic: [],
      optimal: ["all-urls"],
      complete: ["strict.example"],
    });
    expect(result.customMeta).toBe("never-touch-this-value");

    // customFilters should preserve existing domains and merge selectors for m.mobile01.com
    expect(result.customFilters).toEqual([
      ["m.mobile01.com", [".new-ad", ".old-banner"]],
      ["preserve.domain.com", [".keep-me"]],
    ]);
  });

  it("normalizes legacy single-colon pseudo-elements in Stylus CSS", () => {
    const css = `
      .detail-item:before, .manga-bar.active:after {
        font-weight: 400 !important;
      }
    `;
    const result = parseStylusSection(css, ["example.com"]);
    expect(result.styleRules).toHaveLength(1);
    expect(result.styleRules[0]).toContain("::before");
    expect(result.styleRules[0]).toContain("::after");
    if (result.styleRules[0]) {
      validateRuleWithUbo(result.styleRules[0]);
    }
  });

  it("safely handles comma-separated selector lists mixing procedural selectors and pseudo-elements", () => {
    const css = `
      body:has(#popup), .detail-selector-item::before, .view-bar {
        background-color: #f0f0f0 !important;
      }
    `;
    const result = parseStylusSection(css, ["example.com"]);
    expect(result.styleRules.length).toBeGreaterThan(1);
    for (const rule of result.styleRules) {
      validateRuleWithUbo(rule);
    }
  });

  it("handles complex selectors with commas inside :is, :not, and data URLs", () => {
    const css = `
      :is(code, kbd, pre, samp) {
        font-family: monospace !important;
      }
      img[src="data:image/png;base64,iVBORw0KGgoAAA"] {
        display: none !important;
      }
      body:not(:lang(en), :lang(fr)) {
        line-height: 1.5 !important;
      }
    `;
    const result = parseStylusSection(css, ["example.com"]);
    expect(result.cosmeticRules).toEqual([
      'example.com##img[src="data:image/png;base64,iVBORw0KGgoAAA"]',
    ]);
    for (const rule of [...result.cosmeticRules, ...result.styleRules]) {
      validateRuleWithUbo(rule);
    }
  });

  it("supports native uBOL config format (UbolConfigSchema) matching customFilters", () => {
    const nativeConfig: UbolConfig = {
      version: "2026.920.1710",
      filteringModes: {
        none: [],
        basic: [],
        optimal: ["all-urls"],
        complete: [],
      },
      customFilters: [
        [
          "m.mobile01.com",
          [
            "#_popIniFrame",
            "#share-bar",
            ".app-open-btn",
            'div:has(> [aria-label="cookieconsent"])',
          ],
        ],
        ["vite.dev", [".VPDocAside > :not(.VPDocAsideOutline)"]],
      ],
    };

    const parsed = UbolBackupSchema.parse(nativeConfig);
    expect(isUbolConfig(parsed)).toBe(true);
    expect(UbolConfigSchema.parse(nativeConfig)).toBeDefined();

    const directFilterText = ubolConfigToFilterText(nativeConfig);
    expect(directFilterText).toContain("m.mobile01.com###_popIniFrame");

    const filterText = getFiltersFromBackup(parsed);
    expect(filterText).toContain("m.mobile01.com###_popIniFrame");
    expect(filterText).toContain(
      "vite.dev##.VPDocAside > :not(.VPDocAsideOutline)",
    );

    const roundTripped = filterTextToUbolConfig(filterText, {
      version: nativeConfig.version,
    });
    expect(roundTripped.customFilters).toEqual(nativeConfig.customFilters);
  });

  it("runs CLI migrate-stylus correctly to file output", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stylus-cli-test-"));
    const inputFile = path.join(tmpDir, "input.json");
    const outputFile = path.join(tmpDir, "output.json");

    const stylusData = [
      {
        enabled: true,
        sections: [
          {
            code: ".banner { display: none !important; }",
            domains: ["cli-test.com"],
          },
        ],
      },
    ];

    fs.writeFileSync(inputFile, JSON.stringify(stylusData), "utf-8");
    runMigrateStylusCli([inputFile, outputFile]);

    const outputContent = fs.readFileSync(outputFile, "utf-8");
    const parsed = JSON.parse(outputContent) as UbolConfig;
    expect(isUbolConfig(parsed)).toBe(true);
    expect(parsed.customFilters).toEqual([["cli-test.com", [".banner"]]]);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("runs CLI migrate-stylus with --config preserving base settings and merging rules", () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "ubol-cli-test-config-"),
    );
    const inputFile = path.join(tmpDir, "input.json");
    const configFile = path.join(tmpDir, "base.json");
    const outputFile = path.join(tmpDir, "output.json");

    const baseConfig = {
      version: "2026.920.1710",
      filteringModes: {
        none: [],
        basic: [],
        optimal: ["all-urls"],
        complete: [],
      },
      customFilters: [["existing.com", [".existing-hide"]]],
      arbitraryData: 42,
    };

    const stylusData = [
      {
        enabled: true,
        sections: [
          {
            code: ".new-hide { display: none !important; }",
            domains: ["new.com"],
          },
        ],
      },
    ];

    fs.writeFileSync(inputFile, JSON.stringify(stylusData), "utf-8");
    fs.writeFileSync(configFile, JSON.stringify(baseConfig), "utf-8");

    runMigrateStylusCli([inputFile, outputFile, "--config", configFile]);

    const outputContent = fs.readFileSync(outputFile, "utf-8");
    const parsed = JSON.parse(outputContent) as typeof baseConfig;

    // Preserved non-customFilters settings
    expect(parsed.version).toBe("2026.920.1710");
    expect(parsed.filteringModes.optimal).toEqual(["all-urls"]);
    expect(parsed.arbitraryData).toBe(42);

    // Merged customFilters
    expect(parsed.customFilters).toEqual([
      ["existing.com", [".existing-hide"]],
      ["new.com", [".new-hide"]],
    ]);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("migrates real ubol-config-1.json into ubol-config.json format", () => {
    const c1Path = path.resolve(process.cwd(), "ubol-config-1.json");
    if (!fs.existsSync(c1Path)) return;

    const c1Content = fs.readFileSync(c1Path, "utf-8");
    const migrated = migrateStylusJson(c1Content);

    expect(isUbolConfig(migrated)).toBe(true);
    expect(UbolConfigSchema.parse(migrated)).toBeDefined();

    // Verify key domains from ubol-config.json are present
    const domains = migrated.customFilters.map(([d]) => d);
    expect(domains).toContain("m.mobile01.com");
    expect(domains).toContain("nebula.zyxel.com");
    expect(domains).toContain("share.dmhy.org");
    expect(domains).toContain("vite.dev");
    expect(domains).toContain("www.elle.com");
    expect(domains).toContain("www.mobile01.com");
  });
});
