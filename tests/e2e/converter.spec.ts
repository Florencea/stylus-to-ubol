import { expect, test } from "@playwright/test";

test.describe("stylus-to-ubol converter interface", () => {
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
});
