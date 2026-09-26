export interface DeadCodeItem {
  selector: string;
  type: "hide" | "style";
  count: number;
}

export interface WorkbenchModalCallbacks {
  onHideChange: (hideText: string) => void;
  onStyleChange: (styleText: string) => void;
  onExport: () => void;
  onRescanDiagnostics: () => void;
  onPlatformToggle?: (newPlatform: "desktop" | "mobile") => void;
}

class DummyElement {
  public attachShadow(): ShadowRoot {
    return {} as ShadowRoot;
  }
}

const BaseElement =
  typeof HTMLElement !== "undefined"
    ? HTMLElement
    : (DummyElement as unknown as typeof HTMLElement);

export class UbolWorkbenchModal extends BaseElement {
  private shadow: ShadowRoot;
  private callbacks: WorkbenchModalCallbacks | null = null;

  private currentTab: "hide" | "style" | "diagnostics" = "hide";
  private domain = "example.com";
  private platform: "desktop" | "mobile" = "desktop";

  private hideTextarea: HTMLTextAreaElement | null = null;
  private styleTextarea: HTMLTextAreaElement | null = null;
  private diagnosticsContainer: HTMLDivElement | null = null;
  private statusEl: HTMLSpanElement | null = null;
  private platformBadge: HTMLButtonElement | null = null;
  private modalContainer: HTMLDivElement | null = null;

  constructor() {
    super();
    this.shadow =
      typeof this.attachShadow === "function"
        ? this.attachShadow({ mode: "open" })
        : ({} as ShadowRoot);
  }

  public init(
    domain: string,
    platform: "desktop" | "mobile",
    initialHide: string,
    initialStyle: string,
    callbacks: WorkbenchModalCallbacks,
  ): void {
    this.domain = domain;
    this.platform = platform;
    this.callbacks = callbacks;

    this.render();

    if (this.hideTextarea) {
      this.hideTextarea.value = initialHide;
    }
    if (this.styleTextarea) {
      this.styleTextarea.value = initialStyle;
    }
  }

  public getActiveTab(): "hide" | "style" | "diagnostics" {
    return this.currentTab;
  }

  public updatePlatform(platform: "desktop" | "mobile"): void {
    this.platform = platform;
    if (this.platformBadge) {
      this.platformBadge.textContent =
        platform === "mobile" ? "Mobile" : "Desktop";
    }
  }

  public updateStatus(message: string): void {
    if (this.statusEl) {
      this.statusEl.textContent = message;
    }
  }

  public updateDiagnostics(items: DeadCodeItem[]): void {
    if (!this.diagnosticsContainer) return;

    if (items.length === 0) {
      this.diagnosticsContainer.innerHTML =
        '<div class="empty-state">No rules to diagnose</div>';
      return;
    }

    const deadCount = items.filter((i) => i.count === 0).length;
    let html = `
      <div class="diag-summary">
        <span>Analyzed <strong>${String(items.length)}</strong> selectors</span>
        <span class="badge ${deadCount > 0 ? "badge-danger" : "badge-success"}">
          ${deadCount > 0 ? `${String(deadCount)} Dead` : "Clean"}
        </span>
      </div>
      <div class="diag-list">
    `;

    for (const item of items) {
      const isDead = item.count === 0;
      html += `
        <div class="diag-row ${isDead ? "diag-dead" : "diag-active"}">
          <span class="diag-type">${item.type === "hide" ? "Hide" : "Style"}</span>
          <code class="diag-selector" title="${item.selector}">${item.selector}</code>
          <span class="diag-count ${isDead ? "count-zero" : "count-match"}">
            ${isDead ? "0 matches (dead)" : `${String(item.count)} matches`}
          </span>
        </div>
      `;
    }

    html += "</div>";
    this.diagnosticsContainer.innerHTML = html;
  }

  private switchTab(tab: "hide" | "style" | "diagnostics"): void {
    this.currentTab = tab;

    const tabButtons =
      this.shadow.querySelectorAll<HTMLButtonElement>(".tab-btn");
    tabButtons.forEach((btn) => {
      const isTarget = btn.getAttribute("data-tab") === tab;
      btn.classList.toggle("active", isTarget);
    });

    const panes = this.shadow.querySelectorAll<HTMLDivElement>(".tab-pane");
    panes.forEach((pane) => {
      const isTarget = pane.getAttribute("data-pane") === tab;
      pane.classList.toggle("active", isTarget);
    });

    if (tab === "diagnostics" && this.callbacks) {
      this.callbacks.onRescanDiagnostics();
    }
  }

  private render(): void {
    this.shadow.innerHTML = `
      <style>
        :host {
          all: initial;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          font-size: 13px;
          line-height: 1.5;
          color: #e6edf3;
          z-index: 2147483647;
          position: fixed;
          bottom: 20px;
          right: 20px;
        }

        * {
          box-sizing: border-box;
        }

        .toggle-btn {
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: #1f6feb;
          color: #ffffff;
          border: none;
          border-radius: 9999px;
          padding: 10px 16px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
          display: flex;
          align-items: center;
          gap: 6px;
          transition: transform 0.2s, background 0.2s;
        }

        .toggle-btn:hover {
          background: #388bfd;
          transform: translateY(-2px);
        }

        .modal {
          width: 440px;
          max-height: 580px;
          background: #161b22;
          border: 1px solid #30363d;
          border-radius: 12px;
          box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .modal.collapsed {
          display: none;
        }

        .header {
          padding: 12px 16px;
          background: #0d1117;
          border-bottom: 1px solid #30363d;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .title-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .title {
          font-weight: 700;
          font-size: 14px;
          color: #58a6ff;
        }

        .domain-badge {
          background: #21262d;
          border: 1px solid #30363d;
          border-radius: 6px;
          padding: 2px 6px;
          font-size: 11px;
          color: #8b949e;
        }

        .actions-group {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .platform-badge {
          background: #238636;
          color: #ffffff;
          border: none;
          border-radius: 6px;
          padding: 2px 8px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
        }

        .close-btn {
          background: transparent;
          border: none;
          color: #8b949e;
          font-size: 16px;
          cursor: pointer;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .close-btn:hover {
          background: #21262d;
          color: #ffffff;
        }

        .tab-bar {
          display: flex;
          background: #0d1117;
          border-bottom: 1px solid #30363d;
          padding: 0 8px;
        }

        .tab-btn {
          flex: 1;
          padding: 8px 10px;
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          color: #8b949e;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s;
        }

        .tab-btn:hover {
          color: #e6edf3;
        }

        .tab-btn.active {
          color: #58a6ff;
          border-bottom-color: #58a6ff;
          font-weight: 600;
        }

        .tab-content {
          flex: 1;
          padding: 12px 16px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }

        .tab-pane {
          display: none;
          flex-direction: column;
          flex: 1;
          gap: 8px;
        }

        .tab-pane.active {
          display: flex;
        }

        .hint {
          font-size: 11px;
          color: #8b949e;
        }

        textarea {
          width: 100%;
          min-height: 240px;
          background: #0d1117;
          border: 1px solid #30363d;
          border-radius: 6px;
          padding: 10px;
          color: #c9d1d9;
          font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
          font-size: 12px;
          line-height: 1.4;
          resize: vertical;
        }

        textarea:focus {
          outline: none;
          border-color: #58a6ff;
        }

        .footer {
          padding: 10px 16px;
          background: #0d1117;
          border-top: 1px solid #30363d;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .status {
          font-size: 11px;
          color: #3fb950;
        }

        .footer-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .btn-export {
          background: #238636;
          color: #ffffff;
          border: none;
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }

        .btn-export:hover {
          background: #2ea043;
        }

        .btn-secondary {
          background: #21262d;
          border: 1px solid #30363d;
          color: #c9d1d9;
          border-radius: 6px;
          padding: 6px 10px;
          font-size: 12px;
          cursor: pointer;
        }

        .btn-secondary:hover {
          background: #30363d;
        }

        /* Diagnostics */
        .diag-summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 8px;
          border-bottom: 1px solid #30363d;
        }

        .diag-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: 240px;
          overflow-y: auto;
        }

        .diag-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #0d1117;
          border: 1px solid #30363d;
          border-radius: 6px;
          padding: 6px 10px;
          gap: 8px;
        }

        .diag-row.diag-dead {
          border-color: rgba(248, 81, 73, 0.4);
          background: rgba(248, 81, 73, 0.05);
        }

        .diag-type {
          font-size: 11px;
          color: #8b949e;
          white-space: nowrap;
        }

        .diag-selector {
          flex: 1;
          font-family: monospace;
          font-size: 11px;
          color: #58a6ff;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .diag-count {
          font-size: 11px;
          font-weight: 600;
          white-space: nowrap;
        }

        .count-zero {
          color: #f85149;
        }

        .count-match {
          color: #3fb950;
        }

        .badge-danger {
          background: rgba(248, 81, 73, 0.2);
          color: #f85149;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
        }

        .badge-success {
          background: rgba(63, 185, 80, 0.2);
          color: #3fb950;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
        }

        .empty-state {
          text-align: center;
          color: #8b949e;
          padding: 40px 0;
        }
      </style>

      <button class="toggle-btn" id="open-btn">
        uBOL
      </button>

      <div class="modal collapsed" id="modal-container">
        <div class="header">
          <div class="title-group">
            <span class="title">uBOL Workbench</span>
            <span class="domain-badge" id="domain-badge">${this.domain}</span>
          </div>
          <div class="actions-group">
            <button class="platform-badge" id="platform-badge">
              ${this.platform === "mobile" ? "Mobile" : "Desktop"}
            </button>
            <button class="close-btn" id="close-btn" title="Close">x</button>
          </div>
        </div>

        <div class="tab-bar">
          <button class="tab-btn active" data-tab="hide">Hide Selectors</button>
          <button class="tab-btn" data-tab="style">Style Injection</button>
          <button class="tab-btn" data-tab="diagnostics">Dead Code Diagnostics</button>
        </div>

        <div class="tab-content">
          <div class="tab-pane active" data-pane="hide">
            <div class="hint">One selector per line or comma-separated. Maps to display: none !important;</div>
            <textarea id="hide-textarea" placeholder=".ad-banner, #sidebar\n.promoted-post"></textarea>
          </div>

          <div class="tab-pane" data-pane="style">
            <div class="hint">CSS declarations. Enforces !important; dark styles convert to light-dark().</div>
            <textarea id="style-textarea" placeholder=".content {\n  color: light-dark(#000, #fff) !important;\n  background: #ffffff !important;\n}"></textarea>
          </div>

          <div class="tab-pane" data-pane="diagnostics">
            <div id="diagnostics-container">
              <div class="empty-state">Diagnosing page elements...</div>
            </div>
          </div>
        </div>

        <div class="footer">
          <span class="status" id="status-indicator">Live preview active</span>
          <div class="footer-actions">
            <button class="btn-secondary" id="rescan-btn">Rescan</button>
            <button class="btn-export" id="export-btn">Export uBOL JSON</button>
          </div>
        </div>
      </div>
    `;

    this.modalContainer = this.shadow.querySelector("#modal-container");
    const openBtn = this.shadow.querySelector<HTMLButtonElement>("#open-btn");
    const closeBtn = this.shadow.querySelector<HTMLButtonElement>("#close-btn");

    openBtn?.addEventListener("click", () => {
      this.modalContainer?.classList.remove("collapsed");
      openBtn.style.display = "none";
    });

    closeBtn?.addEventListener("click", () => {
      this.modalContainer?.classList.add("collapsed");
      if (openBtn) openBtn.style.display = "flex";
    });

    this.hideTextarea = this.shadow.querySelector("#hide-textarea");
    this.styleTextarea = this.shadow.querySelector("#style-textarea");
    this.diagnosticsContainer = this.shadow.querySelector(
      "#diagnostics-container",
    );
    this.statusEl = this.shadow.querySelector("#status-indicator");
    this.platformBadge = this.shadow.querySelector("#platform-badge");

    this.hideTextarea?.addEventListener("input", () => {
      if (this.callbacks && this.hideTextarea) {
        this.callbacks.onHideChange(this.hideTextarea.value);
      }
    });

    this.styleTextarea?.addEventListener("input", () => {
      if (this.callbacks && this.styleTextarea) {
        this.callbacks.onStyleChange(this.styleTextarea.value);
      }
    });

    const tabButtons =
      this.shadow.querySelectorAll<HTMLButtonElement>(".tab-btn");
    tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const tabAttr = btn.getAttribute("data-tab");
        if (
          tabAttr === "hide" ||
          tabAttr === "style" ||
          tabAttr === "diagnostics"
        ) {
          this.switchTab(tabAttr);
        }
      });
    });

    const exportBtn = this.shadow.querySelector("#export-btn");
    exportBtn?.addEventListener("click", () => {
      if (this.callbacks) {
        this.callbacks.onExport();
      }
    });

    const rescanBtn = this.shadow.querySelector("#rescan-btn");
    rescanBtn?.addEventListener("click", () => {
      if (this.callbacks) {
        this.callbacks.onRescanDiagnostics();
      }
    });

    this.platformBadge?.addEventListener("click", () => {
      const nextPlatform = this.platform === "desktop" ? "mobile" : "desktop";
      this.updatePlatform(nextPlatform);
      if (this.callbacks?.onPlatformToggle) {
        this.callbacks.onPlatformToggle(nextPlatform);
      }
    });
  }
}

if (
  typeof customElements !== "undefined" &&
  !customElements.get("ubol-workbench")
) {
  customElements.define("ubol-workbench", UbolWorkbenchModal);
}
