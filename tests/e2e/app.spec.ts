import { expect, test } from "@playwright/test";

test.describe("stylus-to-ubol web interface", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders initial UI elements correctly", async ({ page }) => {
    await expect(page).toHaveTitle(/stylus-to-ubol/);
    await expect(page.locator("h1")).toHaveText("stylus-to-ubol");
    await expect(page.locator("#stylus-dropzone")).toBeVisible();
    await expect(page.locator("#btn-upload-stylus")).toBeVisible();

    // Stats and error panels are hidden initially
    await expect(page.locator("#stats-panel")).toBeHidden();
    await expect(page.locator("#error-panel")).toBeHidden();

    // Download button is disabled initially
    const btnDownload = page.locator("#btn-download");
    await expect(btnDownload).toBeDisabled();
  });

  test("converts valid stylus.json and displays statistics with active download button", async ({
    page,
  }) => {
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

    // Upload file via file input
    const fileInput = page.locator("#stylus-file-input");
    await fileInput.setInputFiles({
      name: "stylus.json",
      mimeType: "application/json",
      buffer: Buffer.from(validStylusData, "utf-8"),
    });

    // File status should be visible
    await expect(page.locator("#file-status")).toBeVisible();
    await expect(page.locator("#file-name")).toHaveText("stylus.json");

    // Stats panel should be visible
    await expect(page.locator("#stats-panel")).toBeVisible();
    await expect(page.locator("#error-panel")).toBeHidden();

    // Stats metrics
    await expect(page.locator("#stats-domains")).toHaveText("1");
    await expect(page.locator("#stats-hides")).toHaveText("1");
    await expect(page.locator("#stats-styles")).toHaveText("3");

    // Download button should be enabled
    const btnDownload = page.locator("#btn-download");
    await expect(btnDownload).toBeEnabled();

    // Test downloading my-ubol-settings.json
    const downloadPromise = page.waitForEvent("download");
    await btnDownload.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("my-ubol-settings.json");
  });

  test("displays error panel when invalid stylus JSON is uploaded", async ({
    page,
  }) => {
    const invalidJson = JSON.stringify({ invalid: "data without sections" });

    const fileInput = page.locator("#stylus-file-input");
    await fileInput.setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from(invalidJson, "utf-8"),
    });

    // Error panel should be visible
    await expect(page.locator("#error-panel")).toBeVisible();
    await expect(page.locator("#error-message")).toContainText(
      "Invalid Stylus JSON",
    );

    // Stats and download button should be hidden/disabled
    await expect(page.locator("#stats-panel")).toBeHidden();
    await expect(page.locator("#btn-download")).toBeDisabled();
  });

  test("merges optional ublock-config.json preserving non-filter settings", async ({
    page,
  }) => {
    const validStylusData = JSON.stringify([
      {
        sections: [
          {
            domains: ["site.com"],
            code: ".ad { display: none !important; }",
          },
        ],
      },
    ]);

    const baseConfigData = JSON.stringify({
      version: "2024.12.1",
      developerMode: true,
      customProperty: "preserved",
      filteringModes: {
        none: ["site-trusted.com"],
        basic: [],
        optimal: ["all-urls"],
        complete: [],
      },
      customFilters: [["old.com", [".old-hide"]]],
      sandboxFilters: ["old.com##.old-style:style(color: green)"],
    });

    // Upload base config first
    const baseFileInput = page.locator("#base-file-input");
    await baseFileInput.setInputFiles({
      name: "ublock-config.json",
      mimeType: "application/json",
      buffer: Buffer.from(baseConfigData, "utf-8"),
    });

    await expect(page.locator("#base-file-status")).toBeVisible();
    await expect(page.locator("#base-file-name")).toHaveText(
      "ublock-config.json",
    );

    // Download button should still be disabled because stylus is not uploaded yet
    await expect(page.locator("#btn-download")).toBeDisabled();

    // Now upload stylus.json
    const stylusFileInput = page.locator("#stylus-file-input");
    await stylusFileInput.setInputFiles({
      name: "stylus.json",
      mimeType: "application/json",
      buffer: Buffer.from(validStylusData, "utf-8"),
    });

    await expect(page.locator("#stats-panel")).toBeVisible();
    await expect(page.locator("#stats-base-status")).toHaveText(
      "Merged (ublock-config.json)",
    );
    await expect(page.locator("#btn-download")).toBeEnabled();

    // Download and inspect merged content
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#btn-download").click();
    const download = await downloadPromise;

    const stream = await download.createReadStream();
    let text = "";
    for await (const chunk of stream) {
      text += (chunk as Buffer).toString("utf-8");
    }
    const merged = JSON.parse(text) as Record<string, unknown>;
    expect(merged.version).toBe("2024.12.1");
    expect(merged.developerMode).toBe(true);
    expect(merged.customProperty).toBe("preserved");
    expect(merged.customFilters).toEqual([["site.com", [".ad"]]]);
    expect(merged.sandboxFilters).toEqual([]);

    // Clear base configuration
    await page.locator("#btn-clear-base").click();
    await expect(page.locator("#base-file-status")).toBeHidden();
    await expect(page.locator("#stats-base-status")).toHaveText("Default");

    // Download again and verify reverted to default
    const downloadPromise2 = page.waitForEvent("download");
    await page.locator("#btn-download").click();
    const download2 = await downloadPromise2;

    const stream2 = await download2.createReadStream();
    let text2 = "";
    for await (const chunk of stream2) {
      text2 += (chunk as Buffer).toString("utf-8");
    }
    const reverted = JSON.parse(text2) as Record<string, unknown>;
    expect(reverted.developerMode).toBeUndefined();
    expect(reverted.customProperty).toBeUndefined();
    expect(reverted.version).toBe("2026.920.1710");
  });

  test("displays error panel when invalid ublock base config is uploaded", async ({
    page,
  }) => {
    const invalidBaseJson = "not valid json";

    const baseFileInput = page.locator("#base-file-input");
    await baseFileInput.setInputFiles({
      name: "bad-ublock.json",
      mimeType: "application/json",
      buffer: Buffer.from(invalidBaseJson, "utf-8"),
    });

    await expect(page.locator("#error-panel")).toBeVisible();
    await expect(page.locator("#error-message")).toContainText(
      "Failed to parse uBlock config JSON",
    );
    await expect(page.locator("#base-file-status")).toBeHidden();
    await expect(page.locator("#btn-download")).toBeDisabled();
  });
});
