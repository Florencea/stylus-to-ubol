import assert from "node:assert/strict";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "../../scripts/serve.js";
import { STORAGE_KEY_UBOL_BASE } from "../../src/storage.js";

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const SRC_DIR = path.join(ROOT_DIR, "src");

describe("stylus-to-ubol web interface", () => {
  let server;
  let browser;
  let context;
  let page;
  let pageErrors = [];
  let consoleErrors = [];
  let failedResponses = [];

  before(async () => {
    server = await startStaticServer({ rootDir: SRC_DIR, port: 0 });
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    page = await context.newPage();

    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("response", (res) => {
      if (res.status() >= 400) {
        failedResponses.push(`${res.status()} ${res.url()}`);
      }
    });
  });

  beforeEach(async () => {
    pageErrors = [];
    consoleErrors = [];
    failedResponses = [];
    await page.goto(server.url);
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
  });

  after(async () => {
    await context?.close();
    await browser?.close();
    await server?.close();
  });

  it("renders initial UI elements cleanly with native ES modules and stylesheet", async () => {
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(failedResponses, []);

    assert.equal(await page.locator("h1").textContent(), "stylus-to-ubol");
    assert.equal(await page.locator("#stylus-dropzone").count(), 1);
    assert.equal(await page.locator("#btn-upload-stylus").count(), 1);

    // Direct stylesheet link served from src/ without bundling
    assert.equal(
      await page.locator('link[rel="stylesheet"][href="./style.css"]').count(),
      1,
    );

    // Source selector: Default checked, Cached & Uploaded disabled
    assert.equal(await page.locator("#source-default").isChecked(), true);
    assert.equal(await page.locator("#source-cached").isDisabled(), true);
    assert.equal(await page.locator("#source-uploaded").isDisabled(), true);

    // Overwrite checkbox checked by default
    assert.equal(
      await page.locator("#overwrite-cache-checkbox").isChecked(),
      true,
    );

    // Stats and error panels are hidden initially
    assert.equal(await page.locator("#stats-panel").isHidden(), true);
    assert.equal(await page.locator("#error-panel").isHidden(), true);

    // Download button is disabled initially
    assert.equal(await page.locator("#btn-download").isDisabled(), true);
  });

  it("converts valid stylus.json and displays statistics with active download button", async () => {
    const validStylusData = JSON.stringify([
      {
        settings: {},
      },
      {
        id: 1,
        name: "Test Style",
        enabled: true,
        installDate: 123456,
        sections: [
          {
            domains: ["example.com"],
            code: `
              .desktop-sidebar { display: none !important; }
              .header { font-size: 16px !important; }
              @media (pointer: coarse) {
                .mobile-drawer { display: none !important; }
                .touch-item { padding: 12px !important; }
              }
            `,
          },
        ],
      },
    ]);

    await page.locator("#stylus-file-input").setInputFiles({
      name: "stylus.json",
      mimeType: "application/json",
      buffer: Buffer.from(validStylusData, "utf8"),
    });

    await page.locator("#stats-panel").waitFor({ state: "visible" });

    assert.equal(await page.locator("#file-status").isHidden(), false);
    assert.equal(await page.locator("#file-name").textContent(), "stylus.json");
    assert.equal(await page.locator("#error-panel").isHidden(), true);

    assert.equal(await page.locator("#stats-domains").textContent(), "1");
    assert.equal(await page.locator("#stats-hides").textContent(), "1");
    assert.equal(await page.locator("#stats-styles").textContent(), "3");
    assert.equal(
      await page.locator("#stats-base-status").textContent(),
      "Default",
    );
    assert.equal(await page.locator("#btn-download").isDisabled(), false);
  });

  it("displays error panel when invalid stylus JSON is uploaded", async () => {
    const invalidJson = JSON.stringify({ invalid: "data without sections" });

    await page.locator("#stylus-file-input").setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from(invalidJson, "utf8"),
    });

    await page.locator("#error-panel").waitFor({ state: "visible" });

    assert.equal(
      await page.locator("#error-title").textContent(),
      "Invalid Stylus JSON",
    );
    const errorText = await page.locator("#error-message").textContent();
    assert.match(errorText ?? "", /Invalid Stylus JSON/);
    assert.equal(await page.locator("#stats-panel").isHidden(), true);
    assert.equal(await page.locator("#btn-download").isDisabled(), true);
  });

  it("displays CSS syntax error with style name and line number for unsupported CSS", async () => {
    const brokenCssStylus = JSON.stringify([
      { settings: {} },
      {
        name: "Broken Style",
        sections: [
          {
            domains: ["example.com"],
            code: ".card {\n  color red;\n}",
          },
        ],
      },
    ]);

    await page.locator("#stylus-file-input").setInputFiles({
      name: "broken-css.json",
      mimeType: "application/json",
      buffer: Buffer.from(brokenCssStylus, "utf8"),
    });

    await page.locator("#error-panel").waitFor({ state: "visible" });

    assert.equal(
      await page.locator("#error-title").textContent(),
      "CSS Syntax Error",
    );
    const errorText = await page.locator("#error-message").textContent();
    assert.match(errorText ?? "", /style "Broken Style"/);
    assert.match(errorText ?? "", /line 2, column 3/);
    assert.equal(await page.locator("#stats-panel").isHidden(), true);
    assert.equal(await page.locator("#btn-download").isDisabled(), true);
  });

  it("supports uploading base config with cache overwrite enabled", async () => {
    const baseJson = JSON.stringify({
      customFilters: [["custom.org", ["#banner"]]],
      sandboxFilters: [],
    });

    await page.locator("#base-file-input").setInputFiles({
      name: "my-ubol-settings.json",
      mimeType: "application/json",
      buffer: Buffer.from(baseJson, "utf8"),
    });

    await page.locator("#base-file-status").waitFor({ state: "visible" });

    assert.equal(
      await page.locator("#base-file-name").textContent(),
      "my-ubol-settings.json",
    );
    assert.equal(
      await page.locator("#base-file-badge").textContent(),
      "Uploaded",
    );

    const stored = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw === null ? null : JSON.parse(raw);
    }, STORAGE_KEY_UBOL_BASE);
    assert.notEqual(stored, null);
    assert.equal(stored.fileName, "my-ubol-settings.json");

    assert.equal(await page.locator("#source-cached").isDisabled(), false);
    assert.equal(await page.locator("#source-uploaded").isChecked(), true);
  });

  it("supports uploading base config without cache overwrite and switching between sources", async () => {
    // 1. Pre-populate cache and reload
    await page.evaluate(
      ({ key, value }) => {
        localStorage.setItem(key, value);
      },
      {
        key: STORAGE_KEY_UBOL_BASE,
        value: JSON.stringify({
          rawText: JSON.stringify({ cached: true }),
          fileName: "cached-initial.json",
          savedAt: Date.now(),
        }),
      },
    );
    await page.reload();

    // Verify Cached is automatically selected
    assert.equal(await page.locator("#source-cached").isChecked(), true);
    assert.equal(
      await page.locator("#base-file-name").textContent(),
      "cached-initial.json",
    );
    assert.equal(
      await page.locator("#base-file-badge").textContent(),
      "Cached",
    );

    // 2. Uncheck overwrite cache checkbox
    await page.locator("#overwrite-cache-checkbox").uncheck();

    // 3. Upload new base file
    await page.locator("#base-file-input").setInputFiles({
      name: "uploaded-new.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ uploaded: true }), "utf8"),
    });

    await page
      .locator("#base-file-name", { hasText: "uploaded-new.json" })
      .waitFor({ state: "visible" });

    assert.equal(await page.locator("#source-uploaded").isChecked(), true);
    assert.equal(
      await page.locator("#base-file-badge").textContent(),
      "Uploaded",
    );

    // Cache in localStorage must remain the old file
    const stored = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw === null ? null : JSON.parse(raw);
    }, STORAGE_KEY_UBOL_BASE);
    assert.equal(stored?.fileName, "cached-initial.json");

    // 4. Switch back to Cached
    await page.locator("#label-source-cached").click();
    assert.equal(await page.locator("#source-cached").isChecked(), true);
    assert.equal(
      await page.locator("#base-file-name").textContent(),
      "cached-initial.json",
    );
    assert.equal(
      await page.locator("#base-file-badge").textContent(),
      "Cached",
    );

    // 5. Switch back to Uploaded
    await page.locator("#label-source-uploaded").click();
    assert.equal(await page.locator("#source-uploaded").isChecked(), true);
    assert.equal(
      await page.locator("#base-file-name").textContent(),
      "uploaded-new.json",
    );
    assert.equal(
      await page.locator("#base-file-badge").textContent(),
      "Uploaded",
    );

    // Save to Cache button should be visible
    assert.equal(await page.locator("#btn-save-cache").isHidden(), false);

    // Click Save to Cache
    await page.locator("#btn-save-cache").click();

    const updatedStored = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw === null ? null : JSON.parse(raw);
    }, STORAGE_KEY_UBOL_BASE);
    assert.equal(updatedStored?.fileName, "uploaded-new.json");
    assert.equal(await page.locator("#btn-save-cache").isHidden(), true);
  });

  it("clears cached config when Clear Cache button is clicked", async () => {
    await page.evaluate(
      ({ key, value }) => {
        localStorage.setItem(key, value);
      },
      {
        key: STORAGE_KEY_UBOL_BASE,
        value: JSON.stringify({
          rawText: JSON.stringify({ dummy: 1 }),
          fileName: "to-be-cleared.json",
          savedAt: Date.now(),
        }),
      },
    );
    await page.reload();

    assert.equal(await page.locator("#source-cached").isChecked(), true);
    assert.equal(
      await page.locator("#btn-clear-base").textContent(),
      "Clear Cache",
    );

    await page.locator("#btn-clear-base").click();

    const cleared = await page.evaluate(
      (key) => localStorage.getItem(key),
      STORAGE_KEY_UBOL_BASE,
    );
    assert.equal(cleared, null);
    assert.equal(await page.locator("#source-default").isChecked(), true);
    assert.equal(await page.locator("#source-cached").isDisabled(), true);
    assert.equal(await page.locator("#base-file-status").isHidden(), true);
  });
});
