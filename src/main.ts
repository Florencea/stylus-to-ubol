import {
  getFiltersFromBackup,
  UbolBackupSchema,
  type UbolBackup,
} from "./core/schema.ts";
import { extractDomainsFromFilters } from "./userscript/workbench.ts";
import { generateUserscriptBundle } from "./userscript/generator.ts";

let currentBlobUrl = "";
let lastDebugInfo = "";

export const parseAndApplyUbolBackup = (
  rawText: string,
): { backup: UbolBackup; domains: string[]; userscript: string } => {
  const json: unknown = JSON.parse(rawText);
  const backup = UbolBackupSchema.parse(json);
  const filters = getFiltersFromBackup(backup);
  const domains = extractDomainsFromFilters(filters);
  const userscript = generateUserscriptBundle(backup);

  return { backup, domains, userscript };
};

const setupHubApp = (): void => {
  const dropzone = document.getElementById("ubol-dropzone");
  const fileInput = document.getElementById(
    "ubol-file-input",
  ) as HTMLInputElement | null;
  const importBtn = document.getElementById("btn-import-ubol");
  const installLink = document.getElementById(
    "btn-install-userscript",
  ) as HTMLAnchorElement | null;
  const statusInfo = document.getElementById("status-info");
  const errorPanel = document.getElementById("error-panel");
  const errorMessage = document.getElementById("error-message");
  const copyDebugBtn = document.getElementById("btn-copy-debug");

  const showError = (err: unknown, file: File, rawText: string): void => {
    if (installLink) {
      installLink.removeAttribute("href");
      installLink.classList.add("disabled");
      installLink.setAttribute("aria-disabled", "true");
    }

    if (statusInfo) {
      statusInfo.hidden = true;
    }

    const message = err instanceof Error ? err.message : String(err);
    if (errorMessage) {
      errorMessage.textContent = message;
    }
    if (errorPanel) {
      errorPanel.hidden = false;
    }

    lastDebugInfo = [
      "=== uBOL Workbench Debug Info ===",
      `Timestamp: ${new Date().toISOString()}`,
      `File: ${file.name}`,
      `Error: ${message}`,
      err instanceof Error && err.stack ? `Stack:\n${err.stack}` : "",
      "Raw Input Snippet (first 500 chars):",
      rawText.slice(0, 500),
      "=================================",
    ]
      .filter(Boolean)
      .join("\n");
  };

  const processFile = (file: File): void => {
    void file
      .text()
      .then((text) => {
        try {
          const { domains, userscript } = parseAndApplyUbolBackup(text);

          if (currentBlobUrl.length > 0) {
            URL.revokeObjectURL(currentBlobUrl);
          }

          const blob = new Blob([userscript], {
            type: "application/javascript;charset=utf-8",
          });
          currentBlobUrl = URL.createObjectURL(blob);

          if (installLink) {
            installLink.href = currentBlobUrl;
            installLink.classList.remove("disabled");
            installLink.removeAttribute("aria-disabled");
          }

          if (statusInfo) {
            statusInfo.textContent = `Imported "${file.name}": parsed ${String(domains.length)} domain(s). Userscript is ready.`;
            statusInfo.hidden = false;
          }

          if (errorPanel) {
            errorPanel.hidden = true;
          }
          lastDebugInfo = "";
        } catch (err) {
          showError(err, file, text);
        }
      })
      .catch((readErr: unknown) => {
        showError(readErr, file, "");
      });
  };

  // Click & keyboard triggers for file selection
  importBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    fileInput?.click();
  });

  dropzone?.addEventListener("click", () => {
    fileInput?.click();
  });

  dropzone?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput?.click();
    }
  });

  // Drag-and-drop
  dropzone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone?.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });

  dropzone?.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    const file = e.dataTransfer?.files[0];
    if (file) {
      processFile(file);
    }
  });

  // File input change
  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) {
      processFile(file);
    }
  });

  // Copy debug info
  copyDebugBtn?.addEventListener("click", () => {
    if (!lastDebugInfo) return;
    void navigator.clipboard.writeText(lastDebugInfo).then(() => {
      const origText = copyDebugBtn.textContent;
      copyDebugBtn.textContent = "Copied Debug Info!";
      setTimeout(() => {
        copyDebugBtn.textContent = origText;
      }, 2000);
    });
  });
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupHubApp);
} else {
  setupHubApp();
}
