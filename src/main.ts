import { isUbolConfig, type UbolConfig } from "./core/schema.ts";
import { migrateStylusJsonAll } from "./core/stylus-migrator.ts";

export interface ConversionStats {
  domainCount: number;
  hideRuleCount: number;
  styleRuleCount: number;
}

export interface ConversionResult {
  desktop: UbolConfig;
  mobile: UbolConfig;
  complete: UbolConfig;
  desktopStats: ConversionStats;
  mobileStats: ConversionStats;
  completeStats: ConversionStats;
}

export const computeConfigStats = (config: UbolConfig): ConversionStats => {
  const domainSet = new Set<string>();
  let hideRuleCount = 0;

  for (const [domain, selectors] of config.customFilters) {
    const trimmedDomain = domain.trim();
    if (trimmedDomain.length > 0) {
      domainSet.add(trimmedDomain);
    }
    hideRuleCount += selectors.length;
  }

  const styleRuleCount = config.sandboxFilters?.length ?? 0;
  if (config.sandboxFilters) {
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
  }

  return {
    domainCount: domainSet.size,
    hideRuleCount,
    styleRuleCount,
  };
};

export const validateStylusData = (parsed: unknown): void => {
  if (parsed === null || typeof parsed !== "object") {
    throw new Error(
      "Invalid Stylus JSON: Expected a JSON object or array of styles.",
    );
  }

  if (isUbolConfig(parsed)) {
    return;
  }

  if ("userResources" in parsed) {
    return;
  }

  let styleCount = 0;
  let sectionCount = 0;

  interface StyleCandidate {
    sections?: unknown[];
  }

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (item && typeof item === "object") {
        styleCount++;
        const candidate = item as StyleCandidate;
        if (Array.isArray(candidate.sections)) {
          sectionCount += candidate.sections.length;
        }
      }
    }
  } else if (
    "styles" in parsed &&
    Array.isArray((parsed as { styles: unknown[] }).styles)
  ) {
    const candidateList = (parsed as { styles: unknown[] }).styles;
    for (const item of candidateList) {
      if (item && typeof item === "object") {
        styleCount++;
        const candidate = item as StyleCandidate;
        if (Array.isArray(candidate.sections)) {
          sectionCount += candidate.sections.length;
        }
      }
    }
  } else if (
    "sections" in parsed &&
    Array.isArray((parsed as StyleCandidate).sections)
  ) {
    const sections = (parsed as StyleCandidate).sections;
    if (sections) {
      styleCount = 1;
      sectionCount = sections.length;
    }
  }

  if (styleCount === 0 || sectionCount === 0) {
    throw new Error(
      "Invalid Stylus JSON: No styles or code sections found in the uploaded file.",
    );
  }
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

  validateStylusData(parsed);

  const configs = migrateStylusJsonAll(parsed);

  const desktopStats = computeConfigStats(configs.desktop);
  const mobileStats = computeConfigStats(configs.mobile);
  const completeStats = computeConfigStats(configs.complete);

  return {
    desktop: configs.desktop,
    mobile: configs.mobile,
    complete: configs.complete,
    desktopStats,
    mobileStats,
    completeStats,
  };
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
  const errorPanel = document.getElementById("error-panel");
  const errorMessage = document.getElementById("error-message");

  const desktopDomains = document.getElementById("desktop-domains");
  const desktopHides = document.getElementById("desktop-hides");
  const desktopStyles = document.getElementById("desktop-styles");

  const mobileDomains = document.getElementById("mobile-domains");
  const mobileHides = document.getElementById("mobile-hides");
  const mobileStyles = document.getElementById("mobile-styles");

  const completeSummary = document.getElementById("complete-summary");

  const btnDownloadDesktop = document.getElementById(
    "btn-download-desktop",
  ) as HTMLButtonElement | null;
  const btnDownloadMobile = document.getElementById(
    "btn-download-mobile",
  ) as HTMLButtonElement | null;
  const btnDownloadComplete = document.getElementById(
    "btn-download-complete",
  ) as HTMLButtonElement | null;

  let currentResult: ConversionResult | null = null;

  const setDownloadButtonsState = (enabled: boolean): void => {
    const buttons = [
      btnDownloadDesktop,
      btnDownloadMobile,
      btnDownloadComplete,
    ];
    for (const btn of buttons) {
      if (btn) {
        btn.disabled = !enabled;
        if (enabled) {
          btn.classList.remove("disabled");
        } else {
          btn.classList.add("disabled");
        }
      }
    }
  };

  const showError = (err: unknown): void => {
    currentResult = null;
    setDownloadButtonsState(false);

    if (statsPanel) statsPanel.hidden = true;
    if (fileStatus) fileStatus.hidden = true;

    const message = err instanceof Error ? err.message : String(err);
    if (errorMessage) {
      errorMessage.textContent = message;
    }
    if (errorPanel) {
      errorPanel.hidden = false;
    }
  };

  const showSuccess = (filename: string, result: ConversionResult): void => {
    currentResult = result;

    if (errorPanel) errorPanel.hidden = true;
    if (fileName) fileName.textContent = filename;
    if (fileStatus) fileStatus.hidden = false;

    if (desktopDomains) {
      desktopDomains.textContent = String(result.desktopStats.domainCount);
    }
    if (desktopHides) {
      desktopHides.textContent = String(result.desktopStats.hideRuleCount);
    }
    if (desktopStyles) {
      desktopStyles.textContent = String(result.desktopStats.styleRuleCount);
    }

    if (mobileDomains) {
      mobileDomains.textContent = String(result.mobileStats.domainCount);
    }
    if (mobileHides) {
      mobileHides.textContent = String(result.mobileStats.hideRuleCount);
    }
    if (mobileStyles) {
      mobileStyles.textContent = String(result.mobileStats.styleRuleCount);
    }

    if (completeSummary) {
      completeSummary.textContent = `${String(result.completeStats.domainCount)} domains, ${String(result.completeStats.hideRuleCount)} hide rules, ${String(result.completeStats.styleRuleCount)} style rules`;
    }

    if (statsPanel) statsPanel.hidden = false;
    setDownloadButtonsState(true);
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
    if (file) {
      processFile(file);
    }
  });

  // File input change handler
  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) {
      processFile(file);
    }
    fileInput.value = "";
  });

  // Download button handlers
  btnDownloadDesktop?.addEventListener("click", () => {
    if (!currentResult) return;
    const jsonStr = JSON.stringify(currentResult.desktop, null, 2);
    triggerDownload("ubol-config-desktop.json", jsonStr);
  });

  btnDownloadMobile?.addEventListener("click", () => {
    if (!currentResult) return;
    const jsonStr = JSON.stringify(currentResult.mobile, null, 2);
    triggerDownload("ubol-config-mobile.json", jsonStr);
  });

  btnDownloadComplete?.addEventListener("click", () => {
    if (!currentResult) return;
    const jsonStr = JSON.stringify(currentResult.complete, null, 2);
    triggerDownload("ubol-config.json", jsonStr);
  });
};

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupConverterApp);
  } else {
    setupConverterApp();
  }
}
