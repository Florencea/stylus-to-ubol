import {
  compileStylus,
  parseUbolBaseConfig,
  type ConversionResult,
  type UbolConfig,
} from "./compiler.ts";

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
  // Stylus upload elements
  const dropzone = document.getElementById("stylus-dropzone");
  const fileInput = document.getElementById(
    "stylus-file-input",
  ) as HTMLInputElement | null;
  const uploadBtn = document.getElementById("btn-upload-stylus");
  const fileStatus = document.getElementById("file-status");
  const fileName = document.getElementById("file-name");

  // Base config upload elements
  const baseDropzone = document.getElementById("base-dropzone");
  const baseFileInput = document.getElementById(
    "base-file-input",
  ) as HTMLInputElement | null;
  const baseUploadBtn = document.getElementById("btn-upload-base");
  const baseFileStatus = document.getElementById("base-file-status");
  const baseFileName = document.getElementById("base-file-name");
  const btnClearBase = document.getElementById(
    "btn-clear-base",
  ) as HTMLButtonElement | null;

  // Stats elements
  const statsPanel = document.getElementById("stats-panel");
  const statsDomains = document.getElementById("stats-domains");
  const statsHides = document.getElementById("stats-hides");
  const statsStyles = document.getElementById("stats-styles");
  const statsBaseStatus = document.getElementById("stats-base-status");

  // Download & error elements
  const btnDownload = document.getElementById(
    "btn-download",
  ) as HTMLButtonElement | null;
  const errorPanel = document.getElementById("error-panel");
  const errorMessage = document.getElementById("error-message");

  let currentRawStylus: string | null = null;
  let currentStylusName: string | null = null;
  let currentRawBaseConfig: string | null = null;
  let currentBaseConfigName: string | null = null;
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

    const message = err instanceof Error ? err.message : String(err);
    if (errorMessage !== null) {
      errorMessage.textContent = message;
    }
    if (errorPanel !== null) {
      errorPanel.hidden = false;
    }
  };

  const showSuccess = (name: string, result: ConversionResult): void => {
    currentConfig = result.config;

    if (errorPanel !== null) errorPanel.hidden = true;
    if (fileName !== null) fileName.textContent = name;
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
    if (statsBaseStatus !== null) {
      statsBaseStatus.textContent =
        currentBaseConfigName !== null
          ? `Merged (${currentBaseConfigName})`
          : "Default";
    }

    if (statsPanel !== null) statsPanel.hidden = false;
    setDownloadButtonState(true);
  };

  const recompile = (): void => {
    if (currentRawStylus === null || currentStylusName === null) {
      currentConfig = null;
      setDownloadButtonState(false);
      if (statsPanel !== null) statsPanel.hidden = true;
      return;
    }

    try {
      const result = compileStylus(currentRawStylus, currentRawBaseConfig);
      showSuccess(currentStylusName, result);
    } catch (err) {
      showError(err);
    }
  };

  const processStylusFile = (file: File): void => {
    file
      .text()
      .then((rawText) => {
        try {
          const result = compileStylus(rawText, currentRawBaseConfig);
          currentRawStylus = rawText;
          currentStylusName = file.name;
          showSuccess(file.name, result);
        } catch (err) {
          showError(err);
        }
      })
      .catch((err: unknown) => {
        showError(err);
      });
  };

  const processBaseConfigFile = (file: File): void => {
    file
      .text()
      .then((rawText) => {
        try {
          parseUbolBaseConfig(rawText);
        } catch (err) {
          showError(err);
          return;
        }

        currentRawBaseConfig = rawText;
        currentBaseConfigName = file.name;

        if (baseFileName !== null) {
          baseFileName.textContent = file.name;
        }
        if (baseFileStatus !== null) {
          baseFileStatus.hidden = false;
        }

        if (currentRawStylus !== null) {
          recompile();
        }
      })
      .catch((err: unknown) => {
        showError(err);
      });
  };

  const clearBaseConfig = (): void => {
    currentRawBaseConfig = null;
    currentBaseConfigName = null;

    if (baseFileStatus !== null) {
      baseFileStatus.hidden = true;
    }
    if (baseFileInput !== null) {
      baseFileInput.value = "";
    }

    if (currentRawStylus !== null) {
      recompile();
    }
  };

  // Stylus upload button click triggers file input
  uploadBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    fileInput?.click();
  });

  // Stylus dropzone click & keyboard access
  dropzone?.addEventListener("click", () => {
    fileInput?.click();
  });

  dropzone?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput?.click();
    }
  });

  // Stylus drag and drop handlers
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
      processStylusFile(file);
    }
  });

  // Stylus file input change handler
  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file !== undefined) {
      processStylusFile(file);
    }
    fileInput.value = "";
  });

  // Base config upload button click triggers file input
  baseUploadBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    baseFileInput?.click();
  });

  // Base dropzone click & keyboard access
  baseDropzone?.addEventListener("click", () => {
    baseFileInput?.click();
  });

  baseDropzone?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      baseFileInput?.click();
    }
  });

  // Base drag and drop handlers
  baseDropzone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    baseDropzone.classList.add("dragover");
  });

  baseDropzone?.addEventListener("dragleave", () => {
    baseDropzone.classList.remove("dragover");
  });

  baseDropzone?.addEventListener("drop", (e) => {
    e.preventDefault();
    baseDropzone.classList.remove("dragover");
    const file = e.dataTransfer?.files[0];
    if (file !== undefined) {
      processBaseConfigFile(file);
    }
  });

  // Base file input change handler
  baseFileInput?.addEventListener("change", () => {
    const file = baseFileInput.files?.[0];
    if (file !== undefined) {
      processBaseConfigFile(file);
    }
    baseFileInput.value = "";
  });

  // Base config clear button handler
  btnClearBase?.addEventListener("click", (e) => {
    e.stopPropagation();
    clearBaseConfig();
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
