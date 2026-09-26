import { describe, expect, it } from "vitest";
import {
  computeConfigStats,
  convertStylusContent,
  validateStylusData,
} from "../src/main.ts";
import type { UbolConfig } from "../src/core/schema.ts";

describe("Main UI Helper Functions", () => {
  it("computes stats accurately from UbolConfig", () => {
    const config: UbolConfig = {
      version: "2026.920.1710",
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

  it("validates valid Stylus JSON structures and rejects invalid ones", () => {
    // Valid array of styles
    expect(() => {
      validateStylusData([
        {
          name: "Test",
          sections: [{ code: "body { color: red; }" }],
        },
      ]);
    }).not.toThrow();

    // Valid object with styles
    expect(() => {
      validateStylusData({
        styles: [
          {
            name: "Test",
            sections: [{ code: "body { color: red; }" }],
          },
        ],
      });
    }).not.toThrow();

    // Valid object with sections
    expect(() => {
      validateStylusData({
        sections: [{ code: "body { color: red; }" }],
      });
    }).not.toThrow();

    // Rejects null
    expect(() => {
      validateStylusData(null);
    }).toThrow(/Expected a JSON object or array/);

    // Rejects empty object
    expect(() => {
      validateStylusData({});
    }).toThrow(/No styles or code sections found/);

    // Rejects random object
    expect(() => {
      validateStylusData({ foo: "bar" });
    }).toThrow(/No styles or code sections found/);

    // Rejects empty array
    expect(() => {
      validateStylusData([]);
    }).toThrow(/No styles or code sections found/);
  });

  it("converts Stylus JSON string and returns desktop, mobile, and complete configs with stats", () => {
    const rawStylus = JSON.stringify([
      {
        name: "My Style",
        enabled: true,
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

    expect(result.desktop).toBeDefined();
    expect(result.mobile).toBeDefined();
    expect(result.complete).toBeDefined();

    expect(result.desktopStats.domainCount).toBe(1);
    expect(result.desktopStats.hideRuleCount).toBe(1);
    expect(result.mobileStats.domainCount).toBe(1);
    expect(result.mobileStats.hideRuleCount).toBe(2);
    expect(result.completeStats.domainCount).toBe(1);
    expect(result.completeStats.hideRuleCount).toBe(2);
  });

  it("throws clear error on malformed JSON or empty text", () => {
    expect(() => convertStylusContent("")).toThrow(/Uploaded file is empty/);
    expect(() => convertStylusContent("not a json")).toThrow(
      /Failed to parse JSON/,
    );
  });
});
