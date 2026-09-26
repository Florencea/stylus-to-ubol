import { describe, expect, it } from "vitest";
import {
  diagnoseDeadCode,
  extractDomainsFromFilters,
  generateUserscriptHeader,
} from "../src/userscript/workbench.ts";
import type { UbolBackup } from "../src/core/schema.ts";

describe("Workbench Controller", () => {
  it("diagnoses dead code against document selectors", () => {
    const fakeDoc = {
      querySelectorAll(sel: string) {
        if (sel === ".existing") return [{}] as unknown as NodeListOf<Element>;
        return [] as unknown as NodeListOf<Element>;
      },
    } as unknown as Document;

    const items = diagnoseDeadCode(
      ".existing\n.non-existent",
      ".title { color: red; }",
      fakeDoc,
    );
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({ selector: ".existing", type: "hide", count: 1 });
    expect(items[1]).toEqual({
      selector: ".non-existent",
      type: "hide",
      count: 0,
    });
    expect(items[2]).toEqual({ selector: ".title", type: "style", count: 0 });
  });
  it("extracts unique target domains from uBOL filters", () => {
    const filters = `
      github.com##.feed-left
      github.com,gist.github.com##body:style(color: #000 !important;)
      twitter.com##.timeline
      ~bad.twitter.com##.promoted
      ##.generic-ad
      ! Comment
    `;
    const domains = extractDomainsFromFilters(filters);
    expect(domains).toEqual(["gist.github.com", "github.com", "twitter.com"]);
  });

  it("generates exact Userscript @match metadata headers from domains", () => {
    const domains = ["github.com", "gist.github.com", "x.com"];
    const header = generateUserscriptHeader(domains, {
      name: "uBOL Workbench In-Page Client",
      version: "1.0.0",
    });

    expect(header).toContain("// ==UserScript==");
    expect(header).toContain("// @name         uBOL Workbench In-Page Client");
    expect(header).toContain("// @version      1.0.0");
    expect(header).toContain("// @match        *://*.gist.github.com/*");
    expect(header).toContain("// @match        *://*.github.com/*");
    expect(header).toContain("// @match        *://*.x.com/*");
    expect(header).toContain("// ==/UserScript==");
  });

  it("falls back to all urls match when no specific domains exist", () => {
    const header = generateUserscriptHeader([]);
    expect(header).toContain("// @match        *://*/*");
  });

  it("generates exportable uBOL JSON from current state", () => {
    const backup: UbolBackup = {
      userResources: {
        userFilters:
          "example.com##.ad-banner\nexample.com##.content:style(color: red !important;)",
      },
      schemaVersion: 1,
    };
    const jsonStr = JSON.stringify(backup, null, 2);
    expect(jsonStr).toContain("userResources");
    expect(jsonStr).toContain("schemaVersion");
    expect(jsonStr).toContain("example.com##.ad-banner");
  });

  it("generates complete standalone Userscript bundle (.user.js)", async () => {
    const { generateUserscriptBundle } =
      await import("../src/userscript/generator.ts");
    const backup: UbolBackup = {
      userResources: {
        userFilters:
          "github.com##.feed-left\ngithub.com##body:style(color: #000 !important;)",
      },
      schemaVersion: 1,
    };
    const userJs = generateUserscriptBundle(backup);
    expect(userJs).toContain("// ==UserScript==");
    expect(userJs).toContain("// @match        *://*.github.com/*");
    expect(userJs).toContain("// ==/UserScript==");
    expect(userJs).toContain("github.com##.feed-left");
    expect(userJs).toContain("customElements.define");
  });
});
