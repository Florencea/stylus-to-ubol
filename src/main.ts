import { UbolBackupSchema, type UbolBackup } from "./core/schema.ts";
import { migrateStylusJson } from "./core/stylus-migrator.ts";
import {
  extractDomainsFromFilters,
  UbolWorkbenchClient,
} from "./userscript/workbench.ts";
import { generateUserscriptBundle } from "./userscript/generator.ts";

// Sample uBOL data for testing and demonstration
const SAMPLE_UBOL: UbolBackup = {
  userResources: {
    userFilters: [
      "! Sample uBOL workbench filters",
      "localhost##.ad-banner",
      "localhost###sample-sidebar",
      "localhost##.content-box:style(background: light-dark(#f8f9fa, #1f2937) !important; color: light-dark(#111827, #f9fafb) !important; border-radius: 8px !important;)",
      "localhost##.sample-btn:style(background-color: light-dark(#2563eb, #3b82f6) !important;)",
      "github.com##.feed-left",
      "github.com,gist.github.com##body:style(color: light-dark(#24292f, #c9d1d9) !important;)",
    ].join("\n"),
  },
  schemaVersion: 1,
};

let currentBackup: UbolBackup | null = null;
let currentUserscriptCode = "";
let currentBlobUrl = "";
let workbenchClient: UbolWorkbenchClient | null = null;

const statDomainsEl = document.getElementById("stat-domains");
const statHideEl = document.getElementById("stat-hide");
const statStyleEl = document.getElementById("stat-style");
const domainTagsEl = document.getElementById("domain-tags");
const installLink = document.getElementById(
  "btn-install-userscript",
) as HTMLAnchorElement | null;
const previewCodeEl = document.getElementById("userscript-preview");

const updateHubView = (backup: UbolBackup): void => {
  currentBackup = backup;
  const filters = backup.userResources.userFilters;

  const domains = extractDomainsFromFilters(filters);
  const lines = filters.split("\n").map((l) => l.trim());

  let hideCount = 0;
  let styleCount = 0;

  for (const line of lines) {
    if (line.includes("##")) {
      if (line.includes(":style(")) {
        styleCount++;
      } else {
        hideCount++;
      }
    }
  }

  if (statDomainsEl) statDomainsEl.textContent = String(domains.length);
  if (statHideEl) statHideEl.textContent = String(hideCount);
  if (statStyleEl) statStyleEl.textContent = String(styleCount);

  if (domainTagsEl) {
    if (domains.length === 0) {
      domainTagsEl.innerHTML =
        '<span class="tag-empty">No domains parsed</span>';
    } else {
      domainTagsEl.innerHTML = domains
        .map((d) => `<span class="domain-tag">${d}</span>`)
        .join("");
    }
  }

  // Generate userscript
  currentUserscriptCode = generateUserscriptBundle(backup);
  if (previewCodeEl) {
    previewCodeEl.textContent = currentUserscriptCode;
  }

  if (currentBlobUrl.length > 0) {
    URL.revokeObjectURL(currentBlobUrl);
  }
  const blob = new Blob([currentUserscriptCode], {
    type: "application/javascript;charset=utf-8",
  });
  currentBlobUrl = URL.createObjectURL(blob);

  if (installLink) {
    installLink.href = currentBlobUrl;
  }

  // Update in-page workbench
  if (workbenchClient) {
    workbenchClient.loadFilters(filters);
  }
};

const setupEventListeners = (): void => {
  // Tabs
  const tabTriggers =
    document.querySelectorAll<HTMLButtonElement>(".tab-trigger");
  const tabPanels = document.querySelectorAll<HTMLDivElement>(".tab-panel");

  tabTriggers.forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const target = trigger.getAttribute("data-tab");
      tabTriggers.forEach((t) => t.classList.toggle("active", t === trigger));
      tabPanels.forEach((p) =>
        p.classList.toggle("active", p.id === `panel-${target ?? ""}`),
      );
    });
  });

  // Dropzone & File Input
  const dropzone = document.getElementById("ubol-dropzone");
  const fileInput = document.getElementById(
    "ubol-file-input",
  ) as HTMLInputElement | null;
  const ubolTextarea = document.getElementById(
    "ubol-input",
  ) as HTMLTextAreaElement | null;

  dropzone?.addEventListener("click", () => {
    fileInput?.click();
  });

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
      void file.text().then((text) => {
        if (ubolTextarea) ubolTextarea.value = text;
        try {
          const parsed = UbolBackupSchema.parse(JSON.parse(text));
          updateHubView(parsed);
        } catch (err) {
          alert(
            `Parse failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      });
    }
  });

  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) {
      void file.text().then((text) => {
        if (ubolTextarea) ubolTextarea.value = text;
        try {
          const parsed = UbolBackupSchema.parse(JSON.parse(text));
          updateHubView(parsed);
        } catch (err) {
          alert(
            `Parse failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      });
    }
  });

  // Parse button
  const parseBtn = document.getElementById("btn-parse-ubol");
  parseBtn?.addEventListener("click", () => {
    if (!ubolTextarea?.value.trim()) return;
    try {
      const parsed = UbolBackupSchema.parse(JSON.parse(ubolTextarea.value));
      updateHubView(parsed);
    } catch (err) {
      alert(
        `Parse failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  // Load sample
  const sampleBtn = document.getElementById("btn-load-sample");
  sampleBtn?.addEventListener("click", () => {
    if (ubolTextarea) {
      ubolTextarea.value = JSON.stringify(SAMPLE_UBOL, null, 2);
    }
    updateHubView(SAMPLE_UBOL);
  });

  // Stylus Migration
  const migrateBtn = document.getElementById("btn-migrate-stylus");
  const stylusTextarea = document.getElementById(
    "stylus-input",
  ) as HTMLTextAreaElement | null;

  migrateBtn?.addEventListener("click", () => {
    if (!stylusTextarea?.value.trim()) return;
    try {
      const ubolBackup = migrateStylusJson(stylusTextarea.value);
      if (ubolTextarea) {
        ubolTextarea.value = JSON.stringify(ubolBackup, null, 2);
      }
      updateHubView(ubolBackup);
      alert(
        "Stylus migration complete. uBOL backup JSON and Userscript generated.",
      );
    } catch (err) {
      alert(
        `Migration failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  // Copy Userscript
  const copyBtn = document.getElementById("btn-copy-userscript");
  copyBtn?.addEventListener("click", () => {
    if (currentUserscriptCode) {
      void navigator.clipboard.writeText(currentUserscriptCode).then(() => {
        const orig = copyBtn.textContent;
        copyBtn.textContent = "Copied";
        setTimeout(() => {
          copyBtn.textContent = orig;
        }, 2000);
      });
    }
  });

  // Download uBOL JSON
  const downloadUbolBtn = document.getElementById("btn-download-ubol");
  downloadUbolBtn?.addEventListener("click", () => {
    if (!currentBackup) return;
    const blob = new Blob([JSON.stringify(currentBackup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ubol-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  });
};

// Initialize In-Page Workbench
const initApp = (): void => {
  setupEventListeners();

  workbenchClient = new UbolWorkbenchClient({
    domain: window.location.hostname,
  });
  workbenchClient.mount(document.body);

  // Load sample initially so user sees full functionality immediately
  updateHubView(SAMPLE_UBOL);
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
