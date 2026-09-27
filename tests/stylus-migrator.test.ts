import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { AstFilterParser } from "@gorhill/ubo-core/js/static-filtering-parser.js";
import {
  formatStyleDeclarations,
  isColorProperty,
  migrateStylusJson,
  migrateStylusJsonAll,
  migrateStylusJsonDual,
  parseStylusSection,
} from "../src/core/stylus-migrator.ts";
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
      "example.com##.ad-banner",
      "example.com###sidebar",
      "example.com##.popup",
    ]);
    expect(result.styleRules).toHaveLength(0);

    for (const rule of result.cosmeticRules) {
      validateRuleWithUbo(rule);
    }
  });

  it("correctly formats style injection rules preserving original !important state", () => {
    const css = `
      .header {
        background-color: #f5f5f5;
        font-size: 14px !important;
      }
    `;
    const result = parseStylusSection(css, ["example.com"]);
    expect(result.cosmeticRules).toHaveLength(0);
    const firstRule = result.styleRules[0];
    expect(firstRule).toBe(
      "example.com##.header:style(background-color: #f5f5f5; font-size: 14px !important)",
    );
    if (firstRule) {
      validateRuleWithUbo(firstRule);
    }
  });

  it("preserves original !important state in light-dark color pairing and non-color media queries", () => {
    const css = `
      .mixed-colors {
        background: #ffffff;
        color: #000000 !important;
      }
      @media (prefers-color-scheme: dark) {
        .mixed-colors {
          background: #111111;
          color: #ffffff;
        }
      }
      .mixed-noncolors {
        opacity: 0.9;
        font-size: 14px !important;
      }
      @media (prefers-color-scheme: dark) {
        .mixed-noncolors {
          opacity: 0.5 !important;
          font-size: 16px;
        }
      }
    `;
    const result = parseStylusSection(css, ["example.com"]);
    const colorRule = result.styleRules.find((r) =>
      r.includes("##.mixed-colors:style"),
    );
    expect(colorRule).toBeDefined();
    // background: neither has !important -> light-dark without !important
    expect(colorRule).toContain("background: light-dark(#ffffff, #111111);");
    // color: base had !important -> light-dark with !important
    expect(colorRule).toContain(
      "color: light-dark(#000000, #ffffff) !important",
    );

    const baseNonColorRule = result.styleRules.find(
      (r) =>
        r.includes("##.mixed-noncolors:style") && !r.includes(":matches-media"),
    );
    expect(baseNonColorRule).toBeDefined();
    expect(baseNonColorRule).toContain("opacity: 0.9;");
    expect(baseNonColorRule).toContain("font-size: 14px !important");

    const darkNonColorRule = result.styleRules.find((r) =>
      r.includes(
        "##.mixed-noncolors:matches-media((prefers-color-scheme: dark)):style",
      ),
    );
    expect(darkNonColorRule).toBeDefined();
    expect(darkNonColorRule).toContain("opacity: 0.5 !important;");
    expect(darkNonColorRule).toContain("font-size: 16px");

    for (const rule of result.styleRules) {
      validateRuleWithUbo(rule);
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
    expect(contentRule).toContain("color: light-dark(#111111, #eeeeee);");
    expect(contentRule).toContain("background: light-dark(#ffffff, #222222)");

    // Must include color-scheme: light dark !important;
    const hasColorScheme = result.styleRules.some((r) =>
      r.includes("color-scheme: light dark !important"),
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
      "background: light-dark(linear-gradient(180deg, rgba(0, 0, 0, 0.8), rgba(255, 255, 255, 0.2)), linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(0, 0, 0, 0.9)));",
    );
    expect(heroRule).toContain("width: calc(100% - (2 * var(--gutter, 16px)))");

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

    expect(rootRule).toContain("--text-color: light-dark(#24292f, #c9d1d9)");
    expect(rootRule).toContain("--bg-color: light-dark(#ffffff, #0d1117)");
    expect(rootRule).toContain("color-scheme: light dark !important");

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
    expect(cardRule).toContain("background: light-dark(#ffffff, #1a1a1a)");

    expect(titleRule).toBeDefined();
    expect(titleRule).toContain("color: light-dark(#111111, #f0f0f0)");

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
    expect(result.styleRules).toHaveLength(2);
    expect(result.styleRules[0]).toBe(
      "example.com##.detail-item::before:style(font-weight: 400 !important)",
    );
    expect(result.styleRules[1]).toBe(
      "example.com##.manga-bar.active::after:style(font-weight: 400 !important)",
    );
    for (const rule of result.styleRules) {
      validateRuleWithUbo(rule);
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

  it("splits rules cleanly into customFilters (pure hide) and sandboxFilters (:style injection)", () => {
    const stylusInput = [
      {
        enabled: true,
        sections: [
          {
            code: `
              .header_pop { display: none !important; }
              body { font-family: var(--stylus-font-sans-serif) !important; }
            `,
            domains: ["books.com.tw"],
          },
        ],
      },
    ];

    const result = migrateStylusJson(stylusInput);
    expect(isUbolConfig(result)).toBe(true);

    // Pure hide rule -> customFilters
    expect(result.customFilters).toEqual([["books.com.tw", [".header_pop"]]]);

    // Style injection rule -> sandboxFilters
    expect(result.sandboxFilters).toEqual([
      "books.com.tw##body:style(font-family: var(--stylus-font-sans-serif) !important)",
    ]);
  });

  it("handles global generic rules (empty domains) with *## prefix into customFilters and sandboxFilters", () => {
    const stylusInput = [
      {
        enabled: true,
        sections: [
          {
            code: `
              .sp-separator { display: none !important; }
              * { text-rendering: auto !important; }
            `,
            // empty domains
          },
        ],
      },
    ];

    const result = migrateStylusJson(stylusInput);
    expect(isUbolConfig(result)).toBe(true);

    // Pure hide with empty domains -> domain "*" in customFilters
    const starCustom = result.customFilters.find(([d]) => d === "*");
    expect(starCustom).toBeDefined();
    expect(starCustom?.[1]).toContain(".sp-separator");

    // Style rule with empty domains -> "*##" prefix in sandboxFilters
    expect(result.sandboxFilters).toContain(
      "*##*:style(text-rendering: auto !important)",
    );
  });

  it("preserves both customFilters and sandboxFilters from existingConfig during merge", () => {
    const baseConfig = {
      version: "2026.920.1710",
      filteringModes: {
        none: [],
        basic: [],
        optimal: ["all-urls"],
        complete: [],
      },
      customFilters: [["existing.com", [".old-hide"]]] as [string, string[]][],
      sandboxFilters: [
        "existing.com##.old-style:style(color: blue !important;)",
      ],
    };

    const stylusInput = [
      {
        enabled: true,
        sections: [
          {
            code: `
              .new-hide { display: none !important; }
              .new-style { font-size: 16px !important; }
            `,
            domains: ["new.com"],
          },
        ],
      },
    ];

    const result = migrateStylusJson(stylusInput, baseConfig);

    expect(result.customFilters).toEqual([
      ["existing.com", [".old-hide"]],
      ["new.com", [".new-hide"]],
    ]);

    expect(result.sandboxFilters).toEqual([
      "existing.com##.old-style:style(color: blue !important;)",
      "new.com##.new-style:style(font-size: 16px !important)",
    ]);
  });

  it("migrates Stylus input with full style injection rules (:style) across ithome, pts, and news.ycombinator.com", () => {
    const sampleStylusInput = [
      {
        enabled: true,
        sections: [
          {
            // Global generic section (empty domains)
            code: `
              :root { --stylus-bg-dark-firefox: #1d1b1f; }
              .sp-separator { display: none !important; }
              * { text-rendering: auto !important; }
            `,
          },
          {
            // books.com.tw
            code: `
              .header_pop { display: none !important; }
              body { font-family: var(--stylus-font-sans-serif) !important; }
            `,
            domains: ["books.com.tw"],
          },
          {
            // www.ithome.com.tw
            code: `
              #page-header { display: flex !important; justify-content: center !important; width: 100% !important; }
              .channel-item .title { font-size: 1rem !important; }
            `,
            domains: ["www.ithome.com.tw"],
          },
          {
            // pts.org.tw
            code: `
              .container > .row > .col-lg-8 { flex: 0 0 75% !important; }
            `,
            domains: ["pts.org.tw"],
          },
          {
            // news.ycombinator.com
            code: `
              .c00, .c00 a:link { color: light-dark(var(--stylus-hn-c00-light), var(--stylus-hn-c00-dark)) !important; }
            `,
            domains: ["news.ycombinator.com"],
          },
        ],
      },
    ];

    const result = migrateStylusJson(sampleStylusInput);

    expect(isUbolConfig(result)).toBe(true);
    expect(UbolBackupSchema.parse(result)).toBeDefined();

    // Verify books.com.tw has both pure hide in customFilters and style in sandboxFilters
    const booksCustom = result.customFilters.find(
      ([d]) => d === "books.com.tw",
    );
    expect(booksCustom).toBeDefined();
    expect(booksCustom?.[1]).toContain(".header_pop");

    const booksSandbox = result.sandboxFilters?.filter((r) =>
      r.startsWith("books.com.tw##"),
    );
    expect(booksSandbox?.length).toBeGreaterThan(0);
    expect(booksSandbox).toContain(
      "books.com.tw##body:style(font-family: var(--stylus-font-sans-serif) !important)",
    );

    // Verify www.ithome.com.tw has styles in sandboxFilters (flex layout, etc.)
    const ithomeRules = result.sandboxFilters?.filter((r) =>
      r.startsWith("www.ithome.com.tw##"),
    );
    expect(ithomeRules?.length).toBeGreaterThan(0);
    expect(ithomeRules?.some((r) => r.includes("display: flex"))).toBe(true);

    // Verify pts.org.tw has styles in sandboxFilters
    const ptsRules = result.sandboxFilters?.filter((r) =>
      r.startsWith("pts.org.tw##"),
    );
    expect(ptsRules?.length).toBeGreaterThan(0);
    expect(ptsRules?.some((r) => r.includes("flex: 0 0 75%"))).toBe(true);

    // Verify news.ycombinator.com has light-dark styles in sandboxFilters
    const hnRules = result.sandboxFilters?.filter((r) =>
      r.startsWith("news.ycombinator.com##"),
    );
    expect(hnRules?.length).toBeGreaterThan(0);
    expect(hnRules?.some((r) => r.includes("light-dark("))).toBe(true);

    // Verify * has both pure hide and style rules
    const starCustom = result.customFilters.find(([d]) => d === "*");
    expect(starCustom).toBeDefined();
    expect(starCustom?.[1]).toContain(".sp-separator");

    const starSandbox = result.sandboxFilters?.filter((r) =>
      r.startsWith("*##"),
    );
    expect(starSandbox?.length).toBeGreaterThan(0);
    expect(starSandbox?.some((r) => r.includes(":root:style("))).toBe(true);
  });

  it("migrates Stylus section containing filter under prefers-color-scheme: dark into sandboxFilters with :matches-media", () => {
    const stylusJson = JSON.stringify([
      {
        enabled: true,
        name: "Dark Invert Filter",
        sections: [
          {
            domains: ["darksite.com"],
            code: `
              img, video {
                filter: grayscale(0.5);
              }
              @media (prefers-color-scheme: dark) {
                img, video {
                  filter: invert(1) hue-rotate(180deg);
                  opacity: 0.8;
                }
              }
            `,
          },
        ],
      },
    ]);

    const result = migrateStylusJson(stylusJson);
    expect(result.customFilters).toHaveLength(0);
    expect(result.sandboxFilters).toBeDefined();

    // Check base filter rules (individual sub-selectors)
    expect(result.sandboxFilters).toContain(
      "darksite.com##img:style(filter: grayscale(0.5))",
    );
    expect(result.sandboxFilters).toContain(
      "darksite.com##video:style(filter: grayscale(0.5))",
    );

    // Check dark rules (individual sub-selectors)
    expect(result.sandboxFilters).toContain(
      "darksite.com##img:matches-media((prefers-color-scheme: dark)):style(filter: invert(1) hue-rotate(180deg); opacity: 0.8)",
    );
    expect(result.sandboxFilters).toContain(
      "darksite.com##video:matches-media((prefers-color-scheme: dark)):style(filter: invert(1) hue-rotate(180deg); opacity: 0.8)",
    );

    for (const r of result.sandboxFilters ?? []) {
      validateRuleWithUbo(r);
    }
  });

  it("migrates Stylus section containing filter under prefers-color-scheme: light into sandboxFilters with :matches-media", () => {
    const stylusJson = JSON.stringify([
      {
        enabled: true,
        name: "Light Contrast Filter",
        sections: [
          {
            domains: ["lightsite.com"],
            code: `
              img, video {
                filter: grayscale(0.2);
              }
              @media (prefers-color-scheme: light) {
                img, video {
                  filter: contrast(1.1) brightness(0.95);
                  opacity: 0.9;
                }
              }
            `,
          },
        ],
      },
    ]);

    const result = migrateStylusJson(stylusJson);
    expect(result.customFilters).toHaveLength(0);
    expect(result.sandboxFilters).toBeDefined();

    expect(result.sandboxFilters).toContain(
      "lightsite.com##img:style(filter: grayscale(0.2))",
    );
    expect(result.sandboxFilters).toContain(
      "lightsite.com##video:style(filter: grayscale(0.2))",
    );

    expect(result.sandboxFilters).toContain(
      "lightsite.com##img:matches-media((prefers-color-scheme: light)):style(filter: contrast(1.1) brightness(0.95); opacity: 0.9)",
    );
    expect(result.sandboxFilters).toContain(
      "lightsite.com##video:matches-media((prefers-color-scheme: light)):style(filter: contrast(1.1) brightness(0.95); opacity: 0.9)",
    );

    for (const r of result.sandboxFilters ?? []) {
      validateRuleWithUbo(r);
    }
  });

  it("does not truncate :is() selectors with internal commas and emits individual :style rules", () => {
    const stylusJson = JSON.stringify([
      {
        enabled: true,
        sections: [
          {
            domains: ["github.com"],
            code: `
              :is(code, kbd, pre, samp), #read-only-cursor-text-area, .react-code-text, .text-mono, .blob-code-inner {
                font-family: var(--stylus-font-monospace) !important;
              }
            `,
          },
        ],
      },
    ]);

    const result = migrateStylusJson(stylusJson);
    expect(result.customFilters).toHaveLength(0);
    expect(result.sandboxFilters).toEqual([
      "github.com###read-only-cursor-text-area:style(font-family: var(--stylus-font-monospace) !important)",
      "github.com##.blob-code-inner:style(font-family: var(--stylus-font-monospace) !important)",
      "github.com##.react-code-text:style(font-family: var(--stylus-font-monospace) !important)",
      "github.com##.text-mono:style(font-family: var(--stylus-font-monospace) !important)",
      "github.com##:is(code, kbd, pre, samp):style(font-family: var(--stylus-font-monospace) !important)",
    ]);

    for (const r of result.sandboxFilters ?? []) {
      validateRuleWithUbo(r);
    }
  });

  it("splits rules into desktop and mobile scopes via pointer media queries", () => {
    const css = `
      .global-banner {
        display: none !important;
      }
      .desktop-btn {
        font-size: 14px;
      }
      @media (pointer: coarse) {
        .mobile-ad {
          display: none !important;
        }
        .touch-btn {
          font-size: 18px;
        }
      }
    `;

    const parsed = parseStylusSection(css, ["example.com"]);
    expect(parsed.scopedCosmeticRules?.global).toEqual([
      "example.com##.global-banner",
    ]);
    expect(parsed.scopedCosmeticRules?.mobile).toEqual([
      "example.com##.mobile-ad",
    ]);
    expect(parsed.scopedStyleRules?.global).toContain(
      "example.com##.desktop-btn:style(font-size: 14px)",
    );
    expect(parsed.scopedStyleRules?.mobile).toContain(
      "example.com##.touch-btn:style(font-size: 18px)",
    );
  });

  it("migrates Stylus dual styles (desktop and mobile) into distinct SSOT configs", () => {
    const stylusDualJson = JSON.stringify([
      {
        name: "ubo style desktop",
        enabled: true,
        sections: [
          {
            domains: ["site.com"],
            code: `
              .desktop-sidebar { display: none !important; }
              body { font-size: 15px; }
            `,
          },
        ],
      },
      {
        name: "ubo style mobile",
        enabled: true,
        sections: [
          {
            domains: ["site.com"],
            code: `
              @media (pointer: coarse) {
                .mobile-drawer { display: none !important; }
                body { font-size: 18px; }
              }
            `,
          },
        ],
      },
    ]);

    const dual = migrateStylusJsonDual(stylusDualJson);

    // Desktop SSOT config
    expect(dual.desktop.customFilters).toEqual([
      ["site.com", [".desktop-sidebar"]],
    ]);
    expect(dual.desktop.sandboxFilters).toContain(
      "site.com##body:style(font-size: 15px)",
    );
    expect(
      dual.desktop.customFilters.some(([, sels]) =>
        sels.includes(".mobile-drawer"),
      ),
    ).toBe(false);

    // Mobile SSOT config
    // In practice, desktop only applies "ubo style desktop", but mobile applies "ubo style desktop" + "ubo style mobile"
    expect(dual.mobile.customFilters).toEqual([
      ["site.com", [".desktop-sidebar", ".mobile-drawer"]],
    ]);
    expect(dual.mobile.sandboxFilters).toContain(
      "site.com##body:style(font-size: 15px)",
    );
    expect(dual.mobile.sandboxFilters).toContain(
      "site.com##body:style(font-size: 18px)",
    );

    // Validate rules with uBO parser
    for (const [, sels] of dual.desktop.customFilters) {
      for (const sel of sels) validateRuleWithUbo(`site.com##${sel}`);
    }
    for (const r of dual.desktop.sandboxFilters ?? []) validateRuleWithUbo(r);
    for (const [, sels] of dual.mobile.customFilters) {
      for (const sel of sels) validateRuleWithUbo(`site.com##${sel}`);
    }
    for (const r of dual.mobile.sandboxFilters ?? []) validateRuleWithUbo(r);
  });

  it("migrates Stylus dual styles in a single pass into desktop, mobile, and complete configs", () => {
    const stylusDualJson = [
      {
        name: "Base Style",
        enabled: true,
        sections: [
          {
            domains: ["site.com"],
            code: `
              .global-hide { display: none !important; }
              @media (pointer: fine) {
                .desktop-hide { display: none !important; }
              }
              @media (pointer: coarse) {
                .mobile-hide { display: none !important; }
              }
            `,
          },
        ],
      },
    ];

    const all = migrateStylusJsonAll(stylusDualJson);

    expect(all.desktop).toBeDefined();
    expect(all.mobile).toBeDefined();
    expect(all.complete).toBeDefined();

    // Desktop gets global + desktop
    const desktopSels = all.desktop.customFilters[0]?.[1] ?? [];
    expect(desktopSels).toContain(".global-hide");
    expect(desktopSels).toContain(".desktop-hide");
    expect(desktopSels).not.toContain(".mobile-hide");

    // Mobile gets global + mobile
    const mobileSels = all.mobile.customFilters[0]?.[1] ?? [];
    expect(mobileSels).toContain(".global-hide");
    expect(mobileSels).toContain(".mobile-hide");
    expect(mobileSels).not.toContain(".desktop-hide");

    // Complete gets global + desktop + mobile
    const completeSels = all.complete.customFilters[0]?.[1] ?? [];
    expect(completeSels).toContain(".global-hide");
    expect(completeSels).toContain(".desktop-hide");
    expect(completeSels).toContain(".mobile-hide");
  });

  it("migrates project stylus.json in dual mode successfully without uBO validation errors", () => {
    const projectStylusPath = path.resolve(process.cwd(), "stylus.json");
    if (!fs.existsSync(projectStylusPath)) return;

    const content = fs.readFileSync(projectStylusPath, "utf-8");
    const dual = migrateStylusJsonDual(content);

    expect(dual.desktop.customFilters.length).toBeGreaterThan(0);
    expect(dual.mobile.customFilters.length).toBeGreaterThan(0);

    for (const [domain, sels] of dual.desktop.customFilters) {
      for (const sel of sels) validateRuleWithUbo(`${domain}##${sel}`);
    }
    for (const r of dual.desktop.sandboxFilters ?? []) validateRuleWithUbo(r);

    for (const [domain, sels] of dual.mobile.customFilters) {
      for (const sel of sels) validateRuleWithUbo(`${domain}##${sel}`);
    }
    for (const r of dual.mobile.sandboxFilters ?? []) validateRuleWithUbo(r);
  });

  it("identifies color-compatible properties correctly with isColorProperty helper", () => {
    // Standard color properties
    expect(isColorProperty("color")).toBe(true);
    expect(isColorProperty("background-color")).toBe(true);
    expect(isColorProperty("border-color")).toBe(true);
    expect(isColorProperty("outline-color")).toBe(true);
    expect(isColorProperty("box-shadow")).toBe(true);
    expect(isColorProperty("text-shadow")).toBe(true);
    expect(isColorProperty("accent-color")).toBe(true);
    expect(isColorProperty("caret-color")).toBe(true);
    expect(isColorProperty("fill")).toBe(true);
    expect(isColorProperty("stroke")).toBe(true);
    expect(isColorProperty("background")).toBe(true);
    expect(isColorProperty("border")).toBe(true);
    expect(isColorProperty("outline")).toBe(true);
    expect(isColorProperty("border-top-color")).toBe(true);
    expect(isColorProperty("scrollbar-color")).toBe(true);
    expect(isColorProperty("-webkit-text-fill-color")).toBe(true);
    expect(isColorProperty("-webkit-box-shadow")).toBe(true);

    // Custom properties with color keyword in variable name
    expect(isColorProperty("--theme-color")).toBe(true);
    expect(isColorProperty("--bg-color")).toBe(true);
    expect(isColorProperty("--border-width")).toBe(true);
    expect(isColorProperty("--icon-fill")).toBe(true);
    expect(isColorProperty("--line-stroke")).toBe(true);

    // Custom properties without color keyword: tested by value
    expect(isColorProperty("--theme-primary", "#3b82f6")).toBe(true);
    expect(isColorProperty("--theme-primary", "rgb(0, 0, 0)")).toBe(true);
    expect(isColorProperty("--theme-primary", "red")).toBe(true);
    expect(isColorProperty("--theme-primary", "transparent")).toBe(true);
    expect(isColorProperty("--theme-primary", "oklch(0.7 0.15 150)")).toBe(
      true,
    );
    expect(isColorProperty("--theme-primary")).toBe(false);
    expect(isColorProperty("--theme-primary", "8px")).toBe(false);
    expect(isColorProperty("--custom-spacing")).toBe(false);
    expect(isColorProperty("--custom-spacing", "8px")).toBe(false);

    // Non-color properties
    expect(isColorProperty("opacity")).toBe(false);
    expect(isColorProperty("filter")).toBe(false);
    expect(isColorProperty("-webkit-filter")).toBe(false);
    expect(isColorProperty("font-size")).toBe(false);
    expect(isColorProperty("display")).toBe(false);
    expect(isColorProperty("width")).toBe(false);
    expect(isColorProperty("height")).toBe(false);
    expect(isColorProperty("margin")).toBe(false);
    expect(isColorProperty("padding")).toBe(false);
    expect(isColorProperty("transform")).toBe(false);
    expect(isColorProperty("z-index")).toBe(false);
  });

  it("falls back to :matches-media instead of light-dark() for non-color properties (e.g. opacity)", () => {
    const css = `
      .badge {
        color: #111111;
        opacity: 0.9;
        font-size: 14px;
      }
      @media (prefers-color-scheme: dark) {
        .badge {
          color: #eeeeee;
          opacity: 0.5;
          font-size: 16px;
        }
      }
    `;
    const result = parseStylusSection(css, ["example.com"]);
    expect(result.cosmeticRules).toHaveLength(0);

    // Color property synthesizes light-dark()
    const baseRule = result.styleRules.find(
      (r) => r.includes(".badge:style") && !r.includes(":matches-media"),
    );
    expect(baseRule).toBeDefined();
    expect(baseRule).toContain("color: light-dark(#111111, #eeeeee);");
    expect(baseRule).toContain("opacity: 0.9;");
    expect(baseRule).toContain("font-size: 14px");
    expect(baseRule).not.toContain("light-dark(0.9, 0.5)");
    expect(baseRule).not.toContain("light-dark(14px, 16px)");

    // Non-color properties must fall back to :matches-media
    const darkRule = result.styleRules.find((r) =>
      r.includes(".badge:matches-media((prefers-color-scheme: dark)):style"),
    );
    expect(darkRule).toBeDefined();
    expect(darkRule).toContain("opacity: 0.5;");
    expect(darkRule).toContain("font-size: 16px");
    expect(darkRule).not.toContain("color:");

    for (const rule of result.styleRules) {
      validateRuleWithUbo(rule);
    }
  });

  it("properly flattens CSS native nested rules (with and without &) to top-level compound selectors", () => {
    const css = `
      .card, .panel {
        background: #ffffff;
        
        /* nested without & */
        .title {
          font-size: 16px;
          span {
            font-weight: bold;
          }
        }

        /* nested with & */
        &.highlighted {
          border-color: #ff0000;
        }

        &:hover {
          background: #f0f0f0;
        }

        &::after {
          content: "";
        }

        /* nested pure hide */
        .ad {
          display: none !important;
        }
      }
    `;
    const result = parseStylusSection(css, ["example.com"]);

    // Pure hide in nested rule should be flattened into cosmeticRules
    expect(result.cosmeticRules).toEqual([
      "example.com##.card .ad",
      "example.com##.panel .ad",
    ]);

    // Check style rules are flattened compound selectors
    expect(result.styleRules).toContain(
      "example.com##.card:style(background: #ffffff)",
    );
    expect(result.styleRules).toContain(
      "example.com##.panel:style(background: #ffffff)",
    );
    expect(result.styleRules).toContain(
      "example.com##.card .title:style(font-size: 16px)",
    );
    expect(result.styleRules).toContain(
      "example.com##.panel .title:style(font-size: 16px)",
    );
    expect(result.styleRules).toContain(
      "example.com##.card .title span:style(font-weight: bold)",
    );
    expect(result.styleRules).toContain(
      "example.com##.panel .title span:style(font-weight: bold)",
    );
    expect(result.styleRules).toContain(
      "example.com##.card.highlighted:style(border-color: #ff0000)",
    );
    expect(result.styleRules).toContain(
      "example.com##.panel.highlighted:style(border-color: #ff0000)",
    );
    expect(result.styleRules).toContain(
      "example.com##.card:hover:style(background: #f0f0f0)",
    );
    expect(result.styleRules).toContain(
      "example.com##.panel:hover:style(background: #f0f0f0)",
    );
    expect(result.styleRules).toContain(
      'example.com##.card::after:style(content: "")',
    );
    expect(result.styleRules).toContain(
      'example.com##.panel::after:style(content: "")',
    );

    for (const rule of [...result.cosmeticRules, ...result.styleRules]) {
      validateRuleWithUbo(rule);
    }
  });

  it("falls back to :matches-media for CSS variables containing non-color values", () => {
    const css = `
      :root {
        --layout-spacing: 8px;
        --card-opacity: 0.8;
        --theme-accent: #ffffff;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --layout-spacing: 16px;
          --card-opacity: 0.5;
          --theme-accent: #000000;
        }
      }
    `;
    const result = parseStylusSection(css, ["example.com"]);
    expect(result.cosmeticRules).toHaveLength(0);

    // Color variable synthesizes light-dark()
    const standardRootRule = result.styleRules.find(
      (r) => r.includes("##:root:style") && !r.includes(":matches-media"),
    );
    expect(standardRootRule).toBeDefined();
    expect(standardRootRule).toContain(
      "--theme-accent: light-dark(#ffffff, #000000)",
    );
    expect(standardRootRule).toContain("--layout-spacing: 8px;");
    expect(standardRootRule).toContain("--card-opacity: 0.8");

    // Non-color variables fall back to :matches-media
    const darkRootRule = result.styleRules.find((r) =>
      r.includes("##:root:matches-media((prefers-color-scheme: dark)):style"),
    );
    expect(darkRootRule).toBeDefined();
    expect(darkRootRule).toContain("--layout-spacing: 16px;");
    expect(darkRootRule).toContain("--card-opacity: 0.5");
    expect(darkRootRule).not.toContain("--theme-accent");

    for (const rule of result.styleRules) {
      validateRuleWithUbo(rule);
    }
  });

  it("converts custom media queries (e.g. @media (max-width: 600px)) to :matches-media((max-width: 600px)):style(...)", () => {
    const css = `
      .header {
        height: 60px;
      }
      @media (max-width: 600px) {
        .header {
          height: 40px;
          padding: 5px;
        }
        .sidebar {
          display: none;
        }
      }
      @media (min-width: 1200px) {
        .container {
          max-width: 1140px;
        }
      }
    `;
    const result = parseStylusSection(css, ["example.com"]);
    expect(result.cosmeticRules).toHaveLength(0);

    const standardHeader = result.styleRules.find(
      (r) => r.includes(".header:style") && !r.includes(":matches-media"),
    );
    expect(standardHeader).toBeDefined();
    expect(standardHeader).toContain("height: 60px");

    const mobileHeader = result.styleRules.find((r) =>
      r.includes(".header:matches-media((max-width: 600px)):style"),
    );
    expect(mobileHeader).toBeDefined();
    expect(mobileHeader).toContain("height: 40px;");
    expect(mobileHeader).toContain("padding: 5px");

    const mobileSidebar = result.styleRules.find((r) =>
      r.includes(".sidebar:matches-media((max-width: 600px)):style"),
    );
    expect(mobileSidebar).toBeDefined();
    expect(mobileSidebar).toContain("display: none");

    const desktopContainer = result.styleRules.find((r) =>
      r.includes(".container:matches-media((min-width: 1200px)):style"),
    );
    expect(desktopContainer).toBeDefined();
    expect(desktopContainer).toContain("max-width: 1140px");

    for (const rule of result.styleRules) {
      validateRuleWithUbo(rule);
    }
  });

  describe("formatStyleDeclarations", () => {
    it("joins declarations strictly with semicolon and space without trailing semicolon", () => {
      const decls: [string, string][] = [
        ["color", "#ffffff"],
        ["background", "#000000 !important"],
      ];
      expect(formatStyleDeclarations(decls)).toBe(
        "color: #ffffff; background: #000000 !important",
      );
    });

    it("strips trailing semicolons and trailing whitespace inside individual values", () => {
      const decls: [string, string][] = [
        ["color", "#fff;"],
        ["font-size", "14px;;;  "],
        ["opacity", "1 !important; "],
      ];
      expect(formatStyleDeclarations(decls)).toBe(
        "color: #fff; font-size: 14px; opacity: 1 !important",
      );
    });

    it("drops empty or whitespace-only declaration values", () => {
      const decls: [string, string][] = [
        ["color", ""],
        ["border", "   "],
        ["outline", ";;"],
        ["background", "   ;   "],
        ["margin", "0"],
      ];
      expect(formatStyleDeclarations(decls)).toBe("margin: 0");
    });

    it("drops entries with empty or whitespace-only property names", () => {
      const decls: [string, string][] = [
        ["", "#fff"],
        ["   ", "#000"],
        ["color", "#111"],
      ];
      expect(formatStyleDeclarations(decls)).toBe("color: #111");
    });

    it("supports Map input", () => {
      const map = new Map<string, string>([
        ["display", "flex"],
        ["justify-content", "center !important;"],
      ]);
      expect(formatStyleDeclarations(map)).toBe(
        "display: flex; justify-content: center !important",
      );
    });

    it("preserves properties with complex functions (calc, var, linear-gradient) intact", () => {
      const decls: [string, string][] = [
        ["width", "calc(100% - (2 * var(--gutter, 16px))) !important;"],
        [
          "background",
          "linear-gradient(180deg, rgba(0, 0, 0, 0.8), rgba(255, 255, 255, 0.2)) !important;",
        ],
      ];
      expect(formatStyleDeclarations(decls)).toBe(
        "width: calc(100% - (2 * var(--gutter, 16px))) !important; background: linear-gradient(180deg, rgba(0, 0, 0, 0.8), rgba(255, 255, 255, 0.2)) !important",
      );
    });

    it("preserves data URIs with semicolons inside without broken counts", () => {
      const decls: [string, string][] = [
        [
          "background-image",
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg';;></svg>\") !important;",
        ],
      ];
      expect(formatStyleDeclarations(decls)).toBe(
        "background-image: url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg';;></svg>\") !important",
      );
    });

    it("preserves quoted string content including semicolons", () => {
      const decls: [string, string][] = [
        ["content", '"" !important;'],
        ["content", '";"'],
        ["content", "';'"],
      ];
      expect(formatStyleDeclarations(decls)).toBe(
        'content: "" !important; content: ";"; content: \';\'',
      );
    });

    it("returns empty string when input is empty or nullish", () => {
      expect(formatStyleDeclarations([])).toBe("");
      expect(formatStyleDeclarations(new Map())).toBe("");
    });
  });
});
