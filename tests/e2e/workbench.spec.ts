import { test, expect } from "@playwright/test";
import { generateUserscriptBundle } from "../../src/userscript/generator.ts";
import type { UbolBackup } from "../../src/core/schema.ts";

const DOMAIN_UBOL_BACKUP: UbolBackup = {
  userResources: {
    userFilters: [
      "! Test uBOL filters",
      "example.com##.ad-banner",
      "example.com###target-sidebar",
      "example.com##.content-box:style(color: rgb(255, 0, 128) !important;)",
    ].join("\n"),
  },
  schemaVersion: 1,
};

const GENERIC_UBOL_BACKUP: UbolBackup = {
  userResources: {
    userFilters: [
      "! Test generic uBOL filters",
      "##.ad-banner",
      "###target-sidebar",
      "##.content-box:style(color: rgb(255, 0, 128) !important;)",
    ].join("\n"),
  },
  schemaVersion: 1,
};

test.describe("uBOL Workbench Hub E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("Hub loads correctly with minimalist card and no obsolete UI elements", async ({
    page,
  }) => {
    await expect(page.locator("h1")).toHaveText("uBOL Workbench");

    // Minimalist core elements present
    await expect(page.locator("#ubol-dropzone")).toBeVisible();
    await expect(page.locator("#btn-import-ubol")).toBeVisible();
    await expect(page.locator("#btn-install-userscript")).toBeVisible();

    // Initially disabled install button
    const installBtn = page.locator("#btn-install-userscript");
    await expect(installBtn).toHaveClass(/disabled/);
    await expect(installBtn).not.toHaveAttribute("href", /^blob:/);

    // Error panel and status info initially hidden
    await expect(page.locator("#error-panel")).toBeHidden();
    await expect(page.locator("#status-info")).toBeHidden();

    // Obsolete components completely removed from Hub DOM
    await expect(page.locator("#stat-domains")).toHaveCount(0);
    await expect(page.locator("#stat-hide")).toHaveCount(0);
    await expect(page.locator("#stat-style")).toHaveCount(0);
    await expect(page.locator("#userscript-preview")).toHaveCount(0);
    await expect(page.locator("#tab-stylus")).toHaveCount(0);
    await expect(page.locator("#stylus-input")).toHaveCount(0);
    await expect(page.locator(".playground-sandbox")).toHaveCount(0);

    // Floating workbench modal is NOT mounted on the static Hub
    await expect(page.locator("ubol-workbench")).toHaveCount(0);
  });

  test("Valid uBOL JSON import enables Userscript install button with blob URL", async ({
    page,
  }) => {
    const fileInput = page.locator("#ubol-file-input");
    await fileInput.setInputFiles({
      name: "ubol-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(DOMAIN_UBOL_BACKUP, null, 2)),
    });

    // Install button is enabled with blob URL
    const installBtn = page.locator("#btn-install-userscript");
    await expect(installBtn).not.toHaveClass(/disabled/);
    await expect(installBtn).toHaveAttribute("href", /^blob:/);
    await expect(installBtn).toHaveAttribute(
      "download",
      "ubol-workbench.user.js",
    );

    // Status message displays parsed domain info
    const statusInfo = page.locator("#status-info");
    await expect(statusInfo).toBeVisible();
    await expect(statusInfo).toContainText("parsed 1 domain(s)");

    // Error panel remains hidden
    await expect(page.locator("#error-panel")).toBeHidden();
  });

  test("Invalid JSON displays error panel and provides debug info copy", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    const fileInput = page.locator("#ubol-file-input");
    await fileInput.setInputFiles({
      name: "corrupted.json",
      mimeType: "application/json",
      buffer: Buffer.from("{ invalid json content ..."),
    });

    // Install button remains disabled
    const installBtn = page.locator("#btn-install-userscript");
    await expect(installBtn).toHaveClass(/disabled/);

    // Error panel is shown
    const errorPanel = page.locator("#error-panel");
    await expect(errorPanel).toBeVisible();
    await expect(page.locator("#error-message")).not.toBeEmpty();

    // Copy Debug Info button works
    const copyDebugBtn = page.locator("#btn-copy-debug");
    await expect(copyDebugBtn).toBeVisible();
    await copyDebugBtn.click();
    await expect(copyDebugBtn).toHaveText("Copied Debug Info!");
  });
});

test.describe("In-Page Userscript Runtime E2E", () => {
  test("Generated Userscript bundle mounts floating modal and applies live styles on target page", async ({
    page,
  }) => {
    // Navigate to a clean test page with mock DOM elements
    await page.setContent(`
      <!doctype html>
      <html>
        <head><title>Target Page</title></head>
        <body>
          <div id="target-ad" class="ad-banner">Banner</div>
          <div id="target-sidebar">Sidebar</div>
          <div id="target-content" class="content-box">Content</div>
        </body>
      </html>
    `);

    // Generate standalone userscript bundle
    const scriptContent = generateUserscriptBundle(GENERIC_UBOL_BACKUP);

    // Inject userscript into target page as userscript manager would
    await page.addScriptTag({ content: scriptContent });

    // Custom element exists
    const workbenchEl = page.locator("ubol-workbench");
    await expect(workbenchEl).toBeAttached();

    // Injected style tag in head exists
    const injectedStyle = page.locator("head > style#ubol-workbench-injected");
    await expect(injectedStyle).toBeAttached();

    // Toggle button in shadow root
    const openBtn = workbenchEl.locator("#open-btn");
    await expect(openBtn).toBeVisible();

    // Open modal
    await openBtn.click();
    const modal = workbenchEl.locator("#modal");
    await expect(modal).toBeVisible();
    await expect(openBtn).toBeHidden();

    // Cosmetic hide rules hide target elements
    const ad = page.locator("#target-ad");
    await expect(ad).toBeHidden();

    // Hot-swap style injection updates live
    await workbenchEl.locator('button[data-tab="style"]').click();
    const styleTextarea = workbenchEl.locator("#style-text");
    await styleTextarea.fill(
      ".content-box { color: rgb(0, 128, 255) !important; }",
    );

    const contentBox = page.locator("#target-content");
    await expect(contentBox).toHaveCSS("color", "rgb(0, 128, 255)");

    // Dead code diagnostics detects active vs dead selectors
    await workbenchEl.locator('button[data-tab="diag"]').click();
    const diagList = workbenchEl.locator("#diag-list");
    await expect(diagList).toContainText("Analyzed");

    // Close modal
    const closeBtn = workbenchEl.locator("#close-btn");
    await closeBtn.click();
    await expect(modal).toBeHidden();
    await expect(openBtn).toBeVisible();
  });
});
