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

export interface LoadedConfig {
  id: string;
  name: string;
  backup: UbolBackup;
  platform: "desktop" | "mobile" | "global";
  domains: string[];
  hideCount: number;
  styleCount: number;
}

export const detectConfigPlatform = (
  filename: string,
  backup: UbolBackup,
): "desktop" | "mobile" | "global" => {
  const lower = filename.toLowerCase();
  if (lower.includes("desktop") && !lower.includes("mobile")) return "desktop";
  if (lower.includes("mobile") && !lower.includes("desktop")) return "mobile";
  const filters = getFiltersFromBackup(backup);
  if (
    filters.includes("!#if env_mobile") &&
    !filters.includes("!#if !env_mobile")
  ) {
    return "mobile";
  }
  if (
    filters.includes("!#if !env_mobile") &&
    !filters.includes("!#if env_mobile")
  ) {
    return "desktop";
  }
  return "global";
};

export const countConfigRules = (
  backup: UbolBackup,
): { hideCount: number; styleCount: number } => {
  const filters = getFiltersFromBackup(backup);
  let hideCount = 0;
  let styleCount = 0;
  for (const rawLine of filters.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("!") || line.startsWith("#@#")) continue;
    if (line.includes("##")) {
      if (line.includes(":style(")) {
        styleCount++;
      } else {
        const hashIdx = line.indexOf("##");
        const selPart = line.slice(hashIdx + 2).trim();
        const count = selPart
          .split(",")
          .filter((s) => s.trim().length > 0).length;
        hideCount += Math.max(1, count);
      }
    }
  }
  return { hideCount, styleCount };
};

export const combineUbolBackups = (
  configs: LoadedConfig[],
): { combinedBackup: UbolBackup; domains: string[]; userscript: string } => {
  const first = configs[0];
  if (configs.length === 1 && first) {
    const userscript = generateUserscriptBundle(first.backup);
    return {
      combinedBackup: first.backup,
      domains: first.domains,
      userscript,
    };
  }

  const allDomains = new Set<string>();
  const combinedFilterLines: string[] = [];

  for (const cfg of configs) {
    for (const d of cfg.domains) {
      allDomains.add(d);
    }

    const filters = getFiltersFromBackup(cfg.backup);
    const lines = filters
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("! Test"));

    if (cfg.platform === "desktop") {
      combinedFilterLines.push("!#if !env_mobile");
      combinedFilterLines.push(...lines);
      combinedFilterLines.push("!#endif");
    } else if (cfg.platform === "mobile") {
      combinedFilterLines.push("!#if env_mobile");
      combinedFilterLines.push(...lines);
      combinedFilterLines.push("!#endif");
    } else {
      combinedFilterLines.push(...lines);
    }
  }

  const combinedBackup: UbolBackup = {
    userResources: {
      userFilters: combinedFilterLines.join("\n"),
    },
    schemaVersion: 1,
  };

  const userscript = generateUserscriptBundle(combinedBackup);
  return {
    combinedBackup,
    domains: Array.from(allDomains).sort(),
    userscript,
  };
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
  const configsContainer = document.getElementById("configs-container");
  const configsList = document.getElementById("configs-list");
  const clearBtn = document.getElementById("btn-clear-configs");

  let loadedConfigs: LoadedConfig[] = [];

  const showError = (err: unknown, file: File, rawText: string): void => {
    if (installLink && loadedConfigs.length === 0) {
      installLink.removeAttribute("href");
      installLink.classList.add("disabled");
      installLink.setAttribute("aria-disabled", "true");
    }

    if (statusInfo && loadedConfigs.length === 0) {
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

  const renderConfigList = (): void => {
    if (loadedConfigs.length === 0) {
      if (configsContainer) configsContainer.hidden = true;
      if (configsList) configsList.innerHTML = "";
      if (installLink) {
        installLink.removeAttribute("href");
        installLink.classList.add("disabled");
        installLink.setAttribute("aria-disabled", "true");
      }
      if (statusInfo) statusInfo.hidden = true;
      return;
    }

    const { domains, userscript } = combineUbolBackups(loadedConfigs);

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

    if (errorPanel) {
      errorPanel.hidden = true;
    }
    lastDebugInfo = "";

    const single = loadedConfigs[0];
    if (loadedConfigs.length === 1 && single) {
      if (statusInfo) {
        statusInfo.textContent = `Imported "${single.name}": parsed ${String(domains.length)} domain(s). Userscript is ready.`;
        statusInfo.hidden = false;
      }
    } else {
      if (statusInfo) {
        statusInfo.textContent = `Loaded ${String(loadedConfigs.length)} configurations: parsed ${String(domains.length)} unique domain(s). Combined Userscript is ready.`;
        statusInfo.hidden = false;
      }
    }

    if (configsContainer && configsList) {
      configsContainer.hidden = false;
      configsList.innerHTML = "";

      for (const cfg of loadedConfigs) {
        const card = document.createElement("div");
        card.className = "config-card";

        const badgeClass =
          cfg.platform === "desktop"
            ? "badge-desktop"
            : cfg.platform === "mobile"
              ? "badge-mobile"
              : "badge-global";
        const platformLabel =
          cfg.platform === "desktop"
            ? "Desktop"
            : cfg.platform === "mobile"
              ? "Mobile"
              : "Global";

        card.innerHTML = `
          <div class="config-card-header">
            <span class="config-name" title="${cfg.name}">${cfg.name}</span>
            <div class="config-header-actions">
              <span class="config-badge ${badgeClass}">${platformLabel}</span>
              <button type="button" class="btn-remove-config" data-id="${cfg.id}" title="Remove configuration">×</button>
            </div>
          </div>
          <div class="config-stats">
            <span>${String(cfg.domains.length)} domain(s)</span>
            <span>•</span>
            <span>${String(cfg.hideCount)} hide</span>
            <span>•</span>
            <span>${String(cfg.styleCount)} style</span>
          </div>
        `;

        const removeBtn = card.querySelector(".btn-remove-config");
        removeBtn?.addEventListener("click", () => {
          loadedConfigs = loadedConfigs.filter((c) => c.id !== cfg.id);
          renderConfigList();
        });

        configsList.appendChild(card);
      }
    }
  };

  const processFiles = (files: File[]): void => {
    if (files.length === 0) return;

    const readPromises = files.map((file) =>
      file.text().then((text) => ({ file, text })),
    );

    Promise.all(readPromises)
      .then((results) => {
        for (const { file, text } of results) {
          try {
            const json: unknown = JSON.parse(text);
            const backup = UbolBackupSchema.parse(json);
            const filters = getFiltersFromBackup(backup);
            const domains = extractDomainsFromFilters(filters);
            const platform = detectConfigPlatform(file.name, backup);
            const { hideCount, styleCount } = countConfigRules(backup);

            // Remove existing config with duplicate filename
            loadedConfigs = loadedConfigs.filter((c) => c.name !== file.name);

            loadedConfigs.push({
              id: `${file.name}-${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`,
              name: file.name,
              backup,
              platform,
              domains,
              hideCount,
              styleCount,
            });
          } catch (err) {
            showError(err, file, text);
            return;
          }
        }

        renderConfigList();
      })
      .catch((err: unknown) => {
        showError(err, files[0] ?? ({} as File), "");
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
    const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
    if (files.length > 0) {
      processFiles(files);
    }
  });

  // File input change
  fileInput?.addEventListener("change", () => {
    const files = fileInput.files ? Array.from(fileInput.files) : [];
    if (files.length > 0) {
      processFiles(files);
    }
    // Reset file input value to allow re-selecting same file if desired
    fileInput.value = "";
  });

  // Clear all button
  clearBtn?.addEventListener("click", () => {
    loadedConfigs = [];
    renderConfigList();
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
