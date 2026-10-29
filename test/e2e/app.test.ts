import { beforeEach, describe, expect, it } from "vite-plus/test";
import html from "../../index.html?raw";
import { setupConverterApp } from "../../src/main.ts";
import { loadStoredBaseConfig, saveStoredBaseConfig } from "../../src/storage.ts";

describe("stylus-to-ubol web interface", () => {
  beforeEach(() => {
    localStorage.clear();
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

    // Source selector: Default checked, Cached & Uploaded disabled
    const radioDefault = document.querySelector<HTMLInputElement>("#source-default");
    expect(radioDefault?.checked).toBe(true);

    const radioCached = document.querySelector<HTMLInputElement>("#source-cached");
    expect(radioCached?.disabled).toBe(true);

    const radioUploaded = document.querySelector<HTMLInputElement>("#source-uploaded");
    expect(radioUploaded?.disabled).toBe(true);

    // Overwrite checkbox checked by default
    const overwriteCheckbox = document.querySelector<HTMLInputElement>("#overwrite-cache-checkbox");
    expect(overwriteCheckbox?.checked).toBe(true);

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

    const statsBaseStatus = document.getElementById("stats-base-status");
    expect(statsBaseStatus?.textContent).toBe("Default");

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

  it("supports uploading base config with cache overwrite enabled", async () => {
    const baseJson = JSON.stringify({
      customFilters: [["custom.org", ["#banner"]]],
      sandboxFilters: [],
    });

    const baseFileInput = document.querySelector<HTMLInputElement>("#base-file-input");
    expect(baseFileInput).not.toBeNull();

    const file = new File([baseJson], "my-ubol-settings.json", {
      type: "application/json",
    });
    if (baseFileInput !== null) {
      Object.defineProperty(baseFileInput, "files", {
        value: [file],
        configurable: true,
      });
      baseFileInput.dispatchEvent(new Event("change"));
    }

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Base status bar should be visible with Uploaded badge
    const baseFileStatus = document.getElementById("base-file-status");
    expect(baseFileStatus?.hidden).toBe(false);

    const baseFileName = document.getElementById("base-file-name");
    expect(baseFileName?.textContent).toBe("my-ubol-settings.json");

    const baseFileBadge = document.getElementById("base-file-badge");
    expect(baseFileBadge?.textContent).toBe("Uploaded");

    // Because overwrite was checked, localStorage should now contain the config
    const stored = loadStoredBaseConfig();
    expect(stored).not.toBeNull();
    expect(stored?.fileName).toBe("my-ubol-settings.json");

    // Cached radio is now also enabled
    const radioCached = document.querySelector<HTMLInputElement>("#source-cached");
    expect(radioCached?.disabled).toBe(false);

    const radioUploaded = document.querySelector<HTMLInputElement>("#source-uploaded");
    expect(radioUploaded?.checked).toBe(true);
  });

  it("supports uploading base config without cache overwrite and switching between sources", async () => {
    // 1. Pre-populate cache
    saveStoredBaseConfig(JSON.stringify({ cached: true }), "cached-initial.json");

    // 2. Re-mount DOM so app initializes with existing cache
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    document.body.innerHTML = doc.body.innerHTML;
    setupConverterApp();

    // Verify Cached is automatically selected
    const radioCached = document.querySelector<HTMLInputElement>("#source-cached");
    expect(radioCached?.checked).toBe(true);

    const baseFileName = document.getElementById("base-file-name");
    expect(baseFileName?.textContent).toBe("cached-initial.json");

    const baseFileBadge = document.getElementById("base-file-badge");
    expect(baseFileBadge?.textContent).toBe("Cached");

    // 3. Uncheck overwrite cache checkbox
    const overwriteCheckbox = document.querySelector<HTMLInputElement>("#overwrite-cache-checkbox");
    if (overwriteCheckbox !== null) {
      overwriteCheckbox.checked = false;
    }

    // 4. Upload new base file
    const baseFileInput = document.querySelector<HTMLInputElement>("#base-file-input");
    const newFile = new File([JSON.stringify({ uploaded: true })], "uploaded-new.json", {
      type: "application/json",
    });
    if (baseFileInput !== null) {
      Object.defineProperty(baseFileInput, "files", {
        value: [newFile],
        configurable: true,
      });
      baseFileInput.dispatchEvent(new Event("change"));
    }

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Active source should now be Uploaded
    const radioUploaded = document.querySelector<HTMLInputElement>("#source-uploaded");
    expect(radioUploaded?.checked).toBe(true);
    expect(baseFileName?.textContent).toBe("uploaded-new.json");
    expect(baseFileBadge?.textContent).toBe("Uploaded");

    // Cache in localStorage must remain the old file!
    const stored = loadStoredBaseConfig();
    expect(stored?.fileName).toBe("cached-initial.json");

    // 5. Switch back to Cached
    const labelCached = document.getElementById("label-source-cached");
    labelCached?.click();

    expect(radioCached?.checked).toBe(true);
    expect(baseFileName?.textContent).toBe("cached-initial.json");
    expect(baseFileBadge?.textContent).toBe("Cached");

    // 6. Switch back to Uploaded
    const labelUploaded = document.getElementById("label-source-uploaded");
    labelUploaded?.click();

    expect(radioUploaded?.checked).toBe(true);
    expect(baseFileName?.textContent).toBe("uploaded-new.json");
    expect(baseFileBadge?.textContent).toBe("Uploaded");

    // Save to Cache button should be visible
    const btnSaveCache = document.querySelector<HTMLButtonElement>("#btn-save-cache");
    expect(btnSaveCache?.hidden).toBe(false);

    // Click Save to Cache
    btnSaveCache?.click();

    // Now localStorage is updated with uploaded-new.json
    const updatedStored = loadStoredBaseConfig();
    expect(updatedStored?.fileName).toBe("uploaded-new.json");

    // Button should now be hidden
    expect(btnSaveCache?.hidden).toBe(true);
  });

  it("clears cached config when Clear Cache button is clicked", () => {
    saveStoredBaseConfig(JSON.stringify({ dummy: 1 }), "to-be-cleared.json");

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    document.body.innerHTML = doc.body.innerHTML;
    setupConverterApp();

    const radioCached = document.querySelector<HTMLInputElement>("#source-cached");
    expect(radioCached?.checked).toBe(true);

    const btnClearBase = document.querySelector<HTMLButtonElement>("#btn-clear-base");
    expect(btnClearBase?.textContent).toBe("Clear Cache");

    btnClearBase?.click();

    // Cache should be wiped
    expect(loadStoredBaseConfig()).toBeNull();

    // Active source falls back to Default
    const radioDefault = document.querySelector<HTMLInputElement>("#source-default");
    expect(radioDefault?.checked).toBe(true);
    expect(radioCached?.disabled).toBe(true);

    const baseFileStatus = document.getElementById("base-file-status");
    expect(baseFileStatus?.hidden).toBe(true);
  });
});
