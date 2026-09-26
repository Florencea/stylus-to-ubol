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

    // Download buttons are disabled initially
    const btnDesktop = page.locator("#btn-download-desktop");
    const btnMobile = page.locator("#btn-download-mobile");
    const btnComplete = page.locator("#btn-download-complete");

    await expect(btnDesktop).toBeDisabled();
    await expect(btnMobile).toBeDisabled();
    await expect(btnComplete).toBeDisabled();
  });

  test("converts valid stylus.json and displays statistics with active download buttons", async ({
    page,
  }) => {
    const validStylusData = JSON.stringify([
      {
        name: "Test Style",
        enabled: true,
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

    // Desktop stats
    await expect(page.locator("#desktop-domains")).toHaveText("1");
    await expect(page.locator("#desktop-hides")).toHaveText("1");
    await expect(page.locator("#desktop-styles")).toHaveText("1");

    // Mobile stats
    await expect(page.locator("#mobile-domains")).toHaveText("1");
    await expect(page.locator("#mobile-hides")).toHaveText("2");
    await expect(page.locator("#mobile-styles")).toHaveText("2");

    // Complete summary
    await expect(page.locator("#complete-summary")).toContainText("1 domains");

    // Download buttons should be enabled
    const btnDesktop = page.locator("#btn-download-desktop");
    const btnMobile = page.locator("#btn-download-mobile");
    const btnComplete = page.locator("#btn-download-complete");

    await expect(btnDesktop).toBeEnabled();
    await expect(btnMobile).toBeEnabled();
    await expect(btnComplete).toBeEnabled();

    // Test downloading Desktop rules
    const downloadPromise = page.waitForEvent("download");
    await btnDesktop.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("ubol-config-desktop.json");
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
      "No styles or code sections found",
    );

    // Stats and download buttons should be hidden/disabled
    await expect(page.locator("#stats-panel")).toBeHidden();
    await expect(page.locator("#btn-download-desktop")).toBeDisabled();
  });
});
