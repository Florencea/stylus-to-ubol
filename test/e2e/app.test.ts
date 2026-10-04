import { beforeEach, describe, expect, it } from "vite-plus/test";
import html from "../../index.html?raw";
import { setupConverterApp } from "../../src/main.ts";

describe("stylus-to-ubol web interface", () => {
  beforeEach(() => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    document.body.innerHTML = doc.body.innerHTML;
    setupConverterApp();
  });

  it("renders initial UI elements correctly", () => {
    const h1 = document.querySelector("h1");
    expect(h1).not.toBeNull();
    expect(h1?.textContent).toBe("stylus-to-ubol");

    const dropzone = document.getElementById("stylus-dropzone");
    expect(dropzone).not.toBeNull();

    const uploadBtn = document.getElementById("btn-upload-stylus");
    expect(uploadBtn).not.toBeNull();

    // Stats and error panels are hidden initially
    const statsPanel = document.getElementById("stats-panel");
    expect(statsPanel?.hidden).toBe(true);

    const errorPanel = document.getElementById("error-panel");
    expect(errorPanel?.hidden).toBe(true);

    // Download button is disabled initially
    const btnDownload = document.querySelector<HTMLButtonElement>("#btn-download");
    expect(btnDownload?.disabled).toBe(true);
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

    const fileInput = document.querySelector<HTMLInputElement>("#stylus-file-input");
    expect(fileInput).not.toBeNull();

    const file = new File([validStylusData], "stylus.json", {
      type: "application/json",
    });
    if (fileInput !== null) {
      Object.defineProperty(fileInput, "files", {
        value: [file],
        configurable: true,
      });

      fileInput.dispatchEvent(new Event("change"));
    }

    // Wait for file.text() promise resolution
    await new Promise((resolve) => setTimeout(resolve, 50));

    // File status should be visible
    const fileStatus = document.getElementById("file-status");
    expect(fileStatus?.hidden).toBe(false);

    const fileName = document.getElementById("file-name");
    expect(fileName?.textContent).toBe("stylus.json");

    // Stats panel should be visible
    const statsPanel = document.getElementById("stats-panel");
    expect(statsPanel?.hidden).toBe(false);

    const errorPanel = document.getElementById("error-panel");
    expect(errorPanel?.hidden).toBe(true);

    // Stats metrics
    const statsDomains = document.getElementById("stats-domains");
    expect(statsDomains?.textContent).toBe("1");

    const statsHides = document.getElementById("stats-hides");
    expect(statsHides?.textContent).toBe("1");

    const statsStyles = document.getElementById("stats-styles");
    expect(statsStyles?.textContent).toBe("3");

    // Download button should be enabled
    const btnDownload = document.querySelector<HTMLButtonElement>("#btn-download");
    expect(btnDownload?.disabled).toBe(false);
  });

  it("displays error panel when invalid stylus JSON is uploaded", async () => {
    const invalidJson = JSON.stringify({ invalid: "data without sections" });

    const fileInput = document.querySelector<HTMLInputElement>("#stylus-file-input");
    expect(fileInput).not.toBeNull();

    const file = new File([invalidJson], "invalid.json", {
      type: "application/json",
    });
    if (fileInput !== null) {
      Object.defineProperty(fileInput, "files", {
        value: [file],
        configurable: true,
      });

      fileInput.dispatchEvent(new Event("change"));
    }

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Error panel should be visible
    const errorPanel = document.getElementById("error-panel");
    expect(errorPanel?.hidden).toBe(false);

    const errorMessage = document.getElementById("error-message");
    expect(errorMessage?.textContent).toContain("Invalid Stylus JSON");

    // Stats and download button should be hidden/disabled
    const statsPanel = document.getElementById("stats-panel");
    expect(statsPanel?.hidden).toBe(true);

    const btnDownload = document.querySelector<HTMLButtonElement>("#btn-download");
    expect(btnDownload?.disabled).toBe(true);
  });
});
