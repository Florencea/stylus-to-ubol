import {
  compileStylus,
  parseUbolBaseConfig,
  type ConversionResult,
  type UbolConfig,
} from "./compiler.ts";
import {
  clearStoredBaseConfig,
  loadStoredBaseConfig,
  saveStoredBaseConfig,
  type StoredBaseConfig,
} from "./storage.ts";

export type BaseSource = "default" | "cached" | "uploaded";

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
  const fileInput = document.querySelector<HTMLInputElement>("#stylus-file-input");
  const uploadBtn = document.getElementById("btn-upload-stylus");
  const fileStatus = document.getElementById("file-status");
  const fileName = document.getElementById("file-name");

  // Source selector radio inputs & labels
  const radioDefault = document.querySelector<HTMLInputElement>("#source-default");
  const radioCached = document.querySelector<HTMLInputElement>("#source-cached");
  const radioUploaded = document.querySelector<HTMLInputElement>("#source-uploaded");

  const labelDefault = document.getElementById("label-source-default");
  const labelCached = document.getElementById("label-source-cached");
  const labelUploaded = document.getElementById("label-source-uploaded");

  const textCached = document.getElementById("text-source-cached");
  const textUploaded = document.getElementById("text-source-uploaded");

  // Base config upload elements
  const baseDropzone = document.getElementById("base-dropzone");
  const baseFileInput = document.querySelector<HTMLInputElement>("#base-file-input");
  const baseUploadBtn = document.getElementById("btn-upload-base");
  const overwriteCacheCheckbox = document.querySelector<HTMLInputElement>(
    "#overwrite-cache-checkbox",
  );

  // Base file status & action elements
  const baseFileStatus = document.getElementById("base-file-status");
  const baseFileName = document.getElementById("base-file-name");
  const baseFileBadge = document.getElementById("base-file-badge");
  const btnSaveCache = document.querySelector<HTMLButtonElement>("#btn-save-cache");
  const btnClearBase = document.querySelector<HTMLButtonElement>("#btn-clear-base");

  // Stats elements
  const statsPanel = document.getElementById("stats-panel");
  const statsDomains = document.getElementById("stats-domains");
  const statsHides = document.getElementById("stats-hides");
  const statsStyles = document.getElementById("stats-styles");
  const statsBaseStatus = document.getElementById("stats-base-status");

  // Download & error elements
  const btnDownload = document.querySelector<HTMLButtonElement>("#btn-download");
  const errorPanel = document.getElementById("error-panel");
  const errorMessage = document.getElementById("error-message");

  let currentRawStylus: string | null = null;
  let currentStylusName: string | null = null;

  let cachedBaseConfig: StoredBaseConfig | null = null;
  let uploadedBaseConfig: { rawText: string; fileName: string } | null = null;
  let activeBaseSource: BaseSource = "default";

  let currentConfig: UbolConfig | null = null;

  const getActiveBaseConfig = (): { rawText: string; fileName: string } | null => {
    if (activeBaseSource === "cached" && cachedBaseConfig !== null) {
      return { rawText: cachedBaseConfig.rawText, fileName: cachedBaseConfig.fileName };
    }
    if (activeBaseSource === "uploaded" && uploadedBaseConfig !== null) {
      return { rawText: uploadedBaseConfig.rawText, fileName: uploadedBaseConfig.fileName };
    }
    return null;
  };

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
      const activeBase = getActiveBaseConfig();
      if (activeBaseSource === "cached" && activeBase !== null) {
        statsBaseStatus.textContent = `Cached (${activeBase.fileName})`;
      } else if (activeBaseSource === "uploaded" && activeBase !== null) {
        statsBaseStatus.textContent = `Uploaded (${activeBase.fileName})`;
      } else {
        statsBaseStatus.textContent = "Default";
      }
    }

    if (statsPanel !== null) statsPanel.hidden = false;
    setDownloadButtonState(true);
  };

  const updateBaseSourceUI = (): void => {
    // Default option
    if (radioDefault !== null) {
      radioDefault.checked = activeBaseSource === "default";
    }
    labelDefault?.classList.toggle("active", activeBaseSource === "default");

    // Cached option
    const hasCache = cachedBaseConfig !== null;
    if (radioCached !== null) {
      radioCached.disabled = !hasCache;
      radioCached.checked = activeBaseSource === "cached";
    }
    if (labelCached !== null) {
      labelCached.classList.toggle("disabled", !hasCache);
      labelCached.classList.toggle("active", activeBaseSource === "cached");
    }
    if (textCached !== null) {
      textCached.textContent =
        cachedBaseConfig !== null ? `Cached (${cachedBaseConfig.fileName})` : "Cached";
    }

    // Uploaded option
    const hasUploaded = uploadedBaseConfig !== null;
    if (radioUploaded !== null) {
      radioUploaded.disabled = !hasUploaded;
      radioUploaded.checked = activeBaseSource === "uploaded";
    }
    if (labelUploaded !== null) {
      labelUploaded.classList.toggle("disabled", !hasUploaded);
      labelUploaded.classList.toggle("active", activeBaseSource === "uploaded");
    }
    if (textUploaded !== null) {
      textUploaded.textContent =
        uploadedBaseConfig !== null ? `Uploaded (${uploadedBaseConfig.fileName})` : "Uploaded";
    }

    // Base file status bar rendering
    if (activeBaseSource === "default") {
      if (baseFileStatus !== null) baseFileStatus.hidden = true;
    } else if (activeBaseSource === "cached" && cachedBaseConfig !== null) {
      if (baseFileStatus !== null) baseFileStatus.hidden = false;
      if (baseFileName !== null) baseFileName.textContent = cachedBaseConfig.fileName;
      if (baseFileBadge !== null) {
        baseFileBadge.textContent = "Cached";
        baseFileBadge.className = "file-badge badge-cached";
      }
      if (btnSaveCache !== null) btnSaveCache.hidden = true;
      if (btnClearBase !== null) {
        btnClearBase.textContent = "Clear Cache";
        btnClearBase.title = "Clear cached config from browser storage";
        btnClearBase.setAttribute("aria-label", "Clear cached config from browser storage");
      }
    } else if (activeBaseSource === "uploaded" && uploadedBaseConfig !== null) {
      if (baseFileStatus !== null) baseFileStatus.hidden = false;
      if (baseFileName !== null) baseFileName.textContent = uploadedBaseConfig.fileName;
      if (baseFileBadge !== null) {
        baseFileBadge.textContent = "Uploaded";
        baseFileBadge.className = "file-badge badge-uploaded";
      }
      if (btnSaveCache !== null) {
        const isAlreadyCached =
          cachedBaseConfig !== null &&
          cachedBaseConfig.rawText === uploadedBaseConfig.rawText &&
          cachedBaseConfig.fileName === uploadedBaseConfig.fileName;
        btnSaveCache.hidden = isAlreadyCached;
      }
      if (btnClearBase !== null) {
        btnClearBase.textContent = "Remove";
        btnClearBase.title = "Remove uploaded config";
        btnClearBase.setAttribute("aria-label", "Remove uploaded config");
      }
    }

    // Update stats metric if visible
    if (statsBaseStatus !== null && statsPanel !== null && !statsPanel.hidden) {
      const activeBase = getActiveBaseConfig();
      if (activeBaseSource === "cached" && activeBase !== null) {
        statsBaseStatus.textContent = `Cached (${activeBase.fileName})`;
      } else if (activeBaseSource === "uploaded" && activeBase !== null) {
        statsBaseStatus.textContent = `Uploaded (${activeBase.fileName})`;
      } else {
        statsBaseStatus.textContent = "Default";
      }
    }
  };

  const recompile = (): void => {
    if (currentRawStylus === null || currentStylusName === null) {
      currentConfig = null;
      setDownloadButtonState(false);
      if (statsPanel !== null) statsPanel.hidden = true;
      return;
    }

    const activeBase = getActiveBaseConfig();
    try {
      const result = compileStylus(currentRawStylus, activeBase?.rawText ?? null);
      showSuccess(currentStylusName, result);
    } catch (err) {
      showError(err);
    }
  };

  const setBaseSource = (source: BaseSource): void => {
    if (source === "cached" && cachedBaseConfig === null) return;
    if (source === "uploaded" && uploadedBaseConfig === null) return;

    activeBaseSource = source;
    updateBaseSourceUI();

    if (currentRawStylus !== null) {
      recompile();
    }
  };

  const processStylusFile = async (file: File): Promise<void> => {
    try {
      const rawText = await file.text();
      const activeBase = getActiveBaseConfig();
      const result = compileStylus(rawText, activeBase?.rawText ?? null);
      currentRawStylus = rawText;
      currentStylusName = file.name;
      showSuccess(file.name, result);
    } catch (err) {
      showError(err);
    }
  };

  const processBaseConfigFile = async (file: File): Promise<void> => {
    try {
      const rawText = await file.text();
      parseUbolBaseConfig(rawText);

      uploadedBaseConfig = {
        rawText,
        fileName: file.name,
      };
      activeBaseSource = "uploaded";

      const shouldOverwrite = overwriteCacheCheckbox?.checked ?? false;
      if (shouldOverwrite) {
        saveStoredBaseConfig(rawText, file.name);
        cachedBaseConfig = {
          rawText,
          fileName: file.name,
          savedAt: Date.now(),
        };
      }

      updateBaseSourceUI();

      if (currentRawStylus !== null) {
        recompile();
      }
    } catch (err) {
      showError(err);
    }
  };

  const clearBaseConfig = (): void => {
    if (activeBaseSource === "cached") {
      clearStoredBaseConfig();
      cachedBaseConfig = null;
      activeBaseSource = uploadedBaseConfig !== null ? "uploaded" : "default";
    } else if (activeBaseSource === "uploaded") {
      uploadedBaseConfig = null;
      if (baseFileInput !== null) {
        baseFileInput.value = "";
      }
      activeBaseSource = cachedBaseConfig !== null ? "cached" : "default";
    }

    updateBaseSourceUI();

    if (currentRawStylus !== null) {
      recompile();
    }
  };

  // Radio input change handlers
  radioDefault?.addEventListener("change", () => {
    if (radioDefault.checked) setBaseSource("default");
  });

  radioCached?.addEventListener("change", () => {
    if (radioCached.checked) setBaseSource("cached");
  });

  radioUploaded?.addEventListener("change", () => {
    if (radioUploaded.checked) setBaseSource("uploaded");
  });

  // Source label click delegation
  labelDefault?.addEventListener("click", () => {
    setBaseSource("default");
  });

  labelCached?.addEventListener("click", () => {
    setBaseSource("cached");
  });

  labelUploaded?.addEventListener("click", () => {
    setBaseSource("uploaded");
  });

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
      void processStylusFile(file);
    }
  });

  // Stylus file input change handler
  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file !== undefined) {
      void processStylusFile(file);
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
      void processBaseConfigFile(file);
    }
  });

  // Base file input change handler
  baseFileInput?.addEventListener("change", () => {
    const file = baseFileInput.files?.[0];
    if (file !== undefined) {
      void processBaseConfigFile(file);
    }
    baseFileInput.value = "";
  });

  // Save to cache button handler
  btnSaveCache?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (uploadedBaseConfig === null) return;
    saveStoredBaseConfig(uploadedBaseConfig.rawText, uploadedBaseConfig.fileName);
    cachedBaseConfig = {
      rawText: uploadedBaseConfig.rawText,
      fileName: uploadedBaseConfig.fileName,
      savedAt: Date.now(),
    };
    updateBaseSourceUI();
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

  // Initialize from cache
  const stored = loadStoredBaseConfig();
  if (stored !== null) {
    try {
      parseUbolBaseConfig(stored.rawText);
      cachedBaseConfig = stored;
      activeBaseSource = "cached";
    } catch {
      clearStoredBaseConfig();
      cachedBaseConfig = null;
      activeBaseSource = "default";
    }
  } else {
    activeBaseSource = "default";
  }

  updateBaseSourceUI();
};

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupConverterApp);
  } else {
    setupConverterApp();
  }
}
