import { test, expect } from "@playwright/test";

test.describe("uBOL Workbench E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("Hub loads correctly and shows stats and userscript preview", async ({
    page,
  }) => {
    await expect(page.locator("h1")).toHaveText("uBOL Workbench");

    // Check stats are populated from initial sample
    const statDomains = page.locator("#stat-domains");
    await expect(statDomains).not.toHaveText("0");

    // Userscript link is ready with blob URL
    const installLink = page.locator("#btn-install-userscript");
    await expect(installLink).toHaveAttribute("href", /^blob:/);

    // Code preview shows @match headers
    const preview = page.locator("#userscript-preview");
    await expect(preview).toContainText("// ==UserScript==");
    await expect(preview).toContainText("// @match");
  });

  test("Shadow DOM floating modal is mounted and toggles open/collapsed", async ({
    page,
  }) => {
    // Custom element exists
    const workbenchEl = page.locator("ubol-workbench");
    await expect(workbenchEl).toBeAttached();

    // Injected style tag in head exists
    const injectedStyle = page.locator("head > style#ubol-workbench-injected");
    await expect(injectedStyle).toBeAttached();

    // Toggle button in shadow root
    const openBtn = workbenchEl.locator("#open-btn");
    await expect(openBtn).toBeVisible();

    // Click to open modal
    await openBtn.click();

    const modal = workbenchEl.locator("#modal-container");
    await expect(modal).toBeVisible();
    await expect(openBtn).toBeHidden();

    // Close modal
    const closeBtn = workbenchEl.locator("#close-btn");
    await closeBtn.click();
    await expect(modal).toBeHidden();
    await expect(openBtn).toBeVisible();
  });

  test("Hot-swap preview dynamically updates injected CSS on textarea input", async ({
    page,
  }) => {
    const workbenchEl = page.locator("ubol-workbench");
    await workbenchEl.locator("#open-btn").click();

    // Switch to style tab
    await workbenchEl.locator('button[data-tab="style"]').click();

    const styleTextarea = workbenchEl.locator("#style-textarea");
    await styleTextarea.fill(
      ".content-box { color: rgb(255, 0, 128) !important; }",
    );

    // Verify injected style tag in head has the updated CSS
    const injectedStyle = page.locator("head > style#ubol-workbench-injected");
    await expect
      .poll(async () => injectedStyle.evaluate((el) => el.textContent))
      .toContain(".content-box { color: rgb(255, 0, 128) !important; }");

    // Check that computed color of content box changed
    const contentBox = page.locator("#sample-content");
    await expect(contentBox).toHaveCSS("color", "rgb(255, 0, 128)");
  });

  test("Cosmetic hide rules immediately hide target DOM elements", async ({
    page,
  }) => {
    const workbenchEl = page.locator("ubol-workbench");
    await workbenchEl.locator("#open-btn").click();

    const hideTextarea = workbenchEl.locator("#hide-textarea");
    // Hide #sample-sidebar
    await hideTextarea.fill("#sample-sidebar, .ad-banner");

    const sidebar = page.locator("#sample-sidebar");
    await expect(sidebar).toBeHidden();

    const ad = page.locator("#sample-ad");
    await expect(ad).toBeHidden();
  });

  test("Dead code diagnostics detects active vs dead selectors", async ({
    page,
  }) => {
    const workbenchEl = page.locator("ubol-workbench");
    await workbenchEl.locator("#open-btn").click();

    // Set one existing selector (#sample-sidebar) and one dead selector (.fake-non-existent)
    const hideTextarea = workbenchEl.locator("#hide-textarea");
    await hideTextarea.fill("#sample-sidebar, .fake-non-existent");

    // Switch to diagnostics tab
    await workbenchEl.locator('button[data-tab="diagnostics"]').click();

    const diagContainer = workbenchEl.locator("#diagnostics-container");
    await expect(diagContainer).toContainText("1 Dead");
    await expect(diagContainer).toContainText(".fake-non-existent");
    await expect(diagContainer).toContainText("0 matches (dead)");
    await expect(diagContainer).toContainText("#sample-sidebar");
    await expect(diagContainer).toContainText("1 matches");
  });

  test("Perceives and responds to device environment switching", async ({
    page,
  }) => {
    const workbenchEl = page.locator("ubol-workbench");
    await workbenchEl.locator("#open-btn").click();

    const platformBadge = workbenchEl.locator("#platform-badge");
    await expect(platformBadge).toHaveText("Desktop");

    // Click platform badge to toggle to Mobile
    await platformBadge.click();
    await expect(platformBadge).toHaveText("Mobile");

    // Toggle back to Desktop
    await platformBadge.click();
    await expect(platformBadge).toHaveText("Desktop");
  });

  test("Stylus migration tab parses and converts Stylus JSON to uBOL backup", async ({
    page,
  }) => {
    // Switch to Stylus tab
    await page.locator("#tab-stylus").click();

    const stylusInput = page.locator("#stylus-input");
    const sampleStylus = JSON.stringify([
      {
        enabled: true,
        sections: [
          {
            code: `
              .promo { display: none !important; }
              .card {
                background: #ffffff;
              }
              @media (prefers-color-scheme: dark) {
                .card {
                  background: #111111;
                }
              }
            `,
            domains: ["example.com"],
          },
        ],
      },
    ]);

    await stylusInput.fill(sampleStylus);

    // Accept alert dialog
    page.once("dialog", async (dialog) => {
      await dialog.accept();
    });

    await page.locator("#btn-migrate-stylus").click();

    // Verify stats updated
    const preview = page.locator("#userscript-preview");
    await expect(preview).toContainText("light-dark(#ffffff, #111111)");
    await expect(preview).toContainText("color-scheme: light dark !important;");
  });
});
