import { describe, expect, it } from "vitest";
import { computeConfigStats, convertStylusContent } from "../src/main.ts";
import type { UbolConfig } from "../src/schema.ts";

describe("Main UI Helper Functions", () => {
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

    const result = convertStylusContent(rawStylus);

    expect(result.config).toBeDefined();
    expect(result.config.version).toBe("2026.920.1710");
    expect(result.config.customFilters).toEqual([
      ["site.com", [".desktop-ad"]],
    ]);
    expect(result.config.sandboxFilters).toEqual([
      "site.com##.mobile-ad:matches-media((pointer:coarse)):style(display:none !important)",
    ]);

    expect(result.stats.domainCount).toBe(1);
    expect(result.stats.hideRuleCount).toBe(1);
    expect(result.stats.styleRuleCount).toBe(1);
  });

  it("throws clear error on malformed JSON or empty text", () => {
    expect(() => convertStylusContent("")).toThrow(/Uploaded file is empty/);
    expect(() => convertStylusContent("not a json")).toThrow(
      /Failed to parse JSON/,
    );
  });

  it("throws clear error on invalid structure without sections", () => {
    expect(() =>
      convertStylusContent(JSON.stringify([{ invalid: "data" }])),
    ).toThrow(/Invalid Stylus JSON/);
  });
});
