import { type UbolConfig } from "./schema.ts";
import { buildUboRules } from "./converter.ts";
import { parseStylusRules } from "./stylus-loader.ts";

export interface ConversionStats {
  domainCount: number;
  hideRuleCount: number;
  styleRuleCount: number;
}

export interface ConversionResult {
  config: UbolConfig;
  stats: ConversionStats;
}

export const computeConfigStats = (config: UbolConfig): ConversionStats => {
  const domainSet = new Set<string>();
  let hideRuleCount = 0;

  for (const [domain, selectors] of config.customFilters) {
    const trimmed = domain.trim();
    if (trimmed.length > 0) {
      domainSet.add(trimmed);
    }
    hideRuleCount += selectors.length;
  }

  for (const rule of config.sandboxFilters) {
    const hashIdx = rule.indexOf("##");
    if (hashIdx !== -1) {
      const domainPart = rule.slice(0, hashIdx).trim();
      if (domainPart.length > 0) {
        for (const token of domainPart.split(",")) {
          const trimmed = token.trim();
          if (trimmed.length > 0) {
            domainSet.add(trimmed);
          }
        }
      }
    }
  }

  return {
    domainCount: domainSet.size,
    hideRuleCount,
    styleRuleCount: config.sandboxFilters.length,
  };
};

export const convertStylusContent = (rawText: string): ConversionResult => {
  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    throw new Error("Uploaded file is empty.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    throw new Error(
      `Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  let rules;
  try {
    rules = parseStylusRules(parsed);
  } catch (err) {
    throw new Error(
      `Invalid Stylus JSON: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  if (rules.length === 0) {
    throw new Error(
      "Invalid Stylus JSON: No styles or code sections found in the uploaded file.",
    );
  }

  const config = buildUboRules(rules);
  const stats = computeConfigStats(config);

  return { config, stats };
};

export const triggerDownload = (filename: string, content: string): void => {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

export const setupConverterApp = (): void => {
  const dropzone = document.getElementById("stylus-dropzone");
  const fileInput = document.getElementById(
    "stylus-file-input",
  ) as HTMLInputElement | null;
  const uploadBtn = document.getElementById("btn-upload-stylus");
  const fileStatus = document.getElementById("file-status");
  const fileName = document.getElementById("file-name");
  const statsPanel = document.getElementById("stats-panel");
  const statsDomains = document.getElementById("stats-domains");
  const statsHides = document.getElementById("stats-hides");
  const statsStyles = document.getElementById("stats-styles");
  const btnDownload = document.getElementById(
    "btn-download",
  ) as HTMLButtonElement | null;
  const errorPanel = document.getElementById("error-panel");
  const errorMessage = document.getElementById("error-message");

  let currentConfig: UbolConfig | null = null;

  const setDownloadButtonState = (enabled: boolean): void => {
    if (btnDownload !== null) {
      btnDownload.disabled = !enabled;
      if (enabled) {
        btnDownload.classList.remove("disabled");
      } else {
        btnDownload.classList.add("disabled");
      }
    }
  };

  const showError = (err: unknown): void => {
    currentConfig = null;
    setDownloadButtonState(false);

    if (statsPanel !== null) statsPanel.hidden = true;
    if (fileStatus !== null) fileStatus.hidden = true;

    const message = err instanceof Error ? err.message : String(err);
    if (errorMessage !== null) {
      errorMessage.textContent = message;
    }
    if (errorPanel !== null) {
      errorPanel.hidden = false;
    }
  };

  const showSuccess = (filename: string, result: ConversionResult): void => {
    currentConfig = result.config;

    if (errorPanel !== null) errorPanel.hidden = true;
    if (fileName !== null) fileName.textContent = filename;
    if (fileStatus !== null) fileStatus.hidden = false;

    if (statsDomains !== null) {
      statsDomains.textContent = String(result.stats.domainCount);
    }
    if (statsHides !== null) {
      statsHides.textContent = String(result.stats.hideRuleCount);
    }
    if (statsStyles !== null) {
      statsStyles.textContent = String(result.stats.styleRuleCount);
    }

    if (statsPanel !== null) statsPanel.hidden = false;
    setDownloadButtonState(true);
  };

  const processFile = (file: File): void => {
    file
      .text()
      .then((rawText) => {
        try {
          const result = convertStylusContent(rawText);
          showSuccess(file.name, result);
        } catch (err) {
          showError(err);
        }
      })
      .catch((err: unknown) => {
        showError(err);
      });
  };

  // Upload button click triggers file input
  uploadBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    fileInput?.click();
  });

  // Dropzone click & keyboard access
  dropzone?.addEventListener("click", () => {
    fileInput?.click();
  });

  dropzone?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput?.click();
    }
  });

  // Drag and drop handlers
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
    if (file !== undefined) {
      processFile(file);
    }
  });

  // File input change handler
  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file !== undefined) {
      processFile(file);
    }
    fileInput.value = "";
  });

  // Download button handler
  btnDownload?.addEventListener("click", () => {
    if (currentConfig === null) return;
    const jsonStr = JSON.stringify(currentConfig, null, 2);
    triggerDownload("my-ubol-settings.json", jsonStr);
  });
};

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupConverterApp);
  } else {
    setupConverterApp();
  }
}
