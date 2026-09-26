import {
  compileCssToUbolRules,
  parseUbolToCss,
  type Platform,
} from "../core/converter.ts";
import {
  filterTextToUbolConfig,
  getFiltersFromBackup,
  UbolBackupSchema,
  type UbolBackup,
  type UbolConfig,
} from "../core/schema.ts";
import {
  UbolWorkbenchModal,
  type DeadCodeItem,
  type WorkbenchModalCallbacks,
} from "./shadow-modal.ts";

export const extractDomainsFromFilters = (filters: string): string[] => {
  const domains = new Set<string>();

  const lines = filters.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("!") || line.startsWith("#"))
      continue;

    const hashIdx = line.indexOf("##");
    if (hashIdx === -1) continue;

    const domainPart = line.slice(0, hashIdx).trim();
    if (domainPart.length === 0) continue;

    const tokens = domainPart.split(",").map((t) => t.trim());
    for (const token of tokens) {
      if (!token.startsWith("~") && token.length > 0) {
        domains.add(token.toLowerCase());
      }
    }
  }

  return Array.from(domains).sort();
};

export const generateUserscriptHeader = (
  domains: string[],
  options?: { name?: string; version?: string },
): string => {
  const name = options?.name ?? "uBOL Workbench In-Page Client";
  const version = options?.version ?? "1.0.0";

  const lines = [
    "// ==UserScript==",
    `// @name         ${name}`,
    "// @namespace    https://github.com/ubol-workbench",
    `// @version      ${version}`,
    "// @description  uBOL real-time custom styles workbench",
    "// @author       uBOL Workbench Architect",
  ];

  if (domains.length === 0) {
    lines.push("// @match        *://*/*");
  } else {
    for (const d of domains) {
      lines.push(`// @match        *://*.${d}/*`);
    }
  }

  lines.push(
    "// @run-at       document-start",
    "// @grant        none",
    "// ==/UserScript==",
  );

  return lines.join("\n");
};

export const diagnoseDeadCode = (
  hideText: string,
  styleCss: string,
  doc: Document = document,
): DeadCodeItem[] => {
  const items: DeadCodeItem[] = [];

  // 1. Analyze hide selectors
  const hideLines = hideText
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const sel of hideLines) {
    let count: number;
    try {
      count = doc.querySelectorAll(sel).length;
    } catch {
      // Unrecognized selector syntax or pseudo-class
      count = 0;
    }
    items.push({
      selector: sel,
      type: "hide",
      count,
    });
  }

  // 2. Analyze style CSS selectors
  const ruleMatches = styleCss.match(/([^{}]+)\{[^{}]*\}/g);
  if (ruleMatches) {
    for (const rule of ruleMatches) {
      const openBrace = rule.indexOf("{");
      if (openBrace === -1) continue;

      const rawSelector = rule.slice(0, openBrace).trim();
      if (rawSelector.startsWith("@")) continue; // Skip at-rules

      const subSelectors = rawSelector
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const sel of subSelectors) {
        let count: number;
        try {
          count = doc.querySelectorAll(sel).length;
        } catch {
          count = 0;
        }
        items.push({
          selector: sel,
          type: "style",
          count,
        });
      }
    }
  }

  return items;
};

export interface WorkbenchClientOptions {
  domain?: string;
  initialFilters?: string;
  injectedStyleId?: string;
  initialConfig?: UbolConfig;
}

export class UbolWorkbenchClient {
  public domain: string;
  public platform: Platform;
  public injectedStyleEl: HTMLStyleElement;
  public modalEl: UbolWorkbenchModal | null = null;
  public initialConfig: UbolConfig | null = null;

  public hideText = "";
  public styleText = "";

  constructor(options?: WorkbenchClientOptions) {
    this.domain =
      options?.domain ??
      (typeof window !== "undefined"
        ? window.location.hostname
        : "example.com");

    this.platform = this.detectPlatform();
    this.initialConfig = options?.initialConfig ?? null;

    const styleId = options?.injectedStyleId ?? "ubol-workbench-injected";
    let style =
      typeof document !== "undefined"
        ? (document.getElementById(styleId) as HTMLStyleElement | null)
        : null;

    if (!style && typeof document !== "undefined") {
      style = document.createElement("style");
      style.id = styleId;
      document.head.appendChild(style);
    }

    this.injectedStyleEl = style ?? ({} as HTMLStyleElement);

    if (options?.initialFilters) {
      this.loadFilters(options.initialFilters);
    }
  }

  public detectPlatform(): Platform {
    if (typeof window === "undefined") return "desktop";
    return window.matchMedia("(max-width: 768px)").matches
      ? "mobile"
      : "desktop";
  }

  public loadFilters(filters: string): void {
    const rawCss = parseUbolToCss(filters, this.domain, this.platform);
    this.updateFromCompiledCss(rawCss);
  }

  public updateFromCompiledCss(css: string): void {
    const hideSelectors: string[] = [];
    const styleBlocks: string[] = [];

    const blocks = css.split("\n\n");
    for (const block of blocks) {
      const trimmed = block.trim();
      if (trimmed.length === 0) continue;

      const openBrace = trimmed.indexOf("{");
      const closeBrace = trimmed.lastIndexOf("}");
      if (openBrace === -1 || closeBrace === -1) continue;

      const selector = trimmed.slice(0, openBrace).trim();
      const body = trimmed.slice(openBrace + 1, closeBrace).trim();

      if (body === "display: none !important;") {
        hideSelectors.push(selector);
      } else {
        styleBlocks.push(trimmed);
      }
    }

    this.hideText = hideSelectors.join(", ");
    this.styleText = styleBlocks.join("\n\n");
    this.recalculateAndApply();
  }

  public recalculateAndApply(): void {
    const cssParts: string[] = [];

    const cleanHide = this.hideText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .join(", ");

    if (cleanHide.length > 0) {
      cssParts.push(`${cleanHide} {\n  display: none !important;\n}`);
    }

    if (this.styleText.trim().length > 0) {
      cssParts.push(this.styleText.trim());
    }

    const combinedCss = cssParts.join("\n\n");
    this.injectedStyleEl.textContent = combinedCss;

    this.refreshDiagnostics();
  }

  public refreshDiagnostics(): void {
    if (typeof document === "undefined" || !this.modalEl) return;
    const items = diagnoseDeadCode(this.hideText, this.styleText, document);
    this.modalEl.updateDiagnostics(items);
  }

  public exportBackup(): UbolBackup {
    const cssParts: string[] = [];

    const cleanHide = this.hideText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .join(", ");

    if (cleanHide.length > 0) {
      cssParts.push(`${cleanHide} {\n  display: none !important;\n}`);
    }

    if (this.styleText.trim().length > 0) {
      cssParts.push(this.styleText.trim());
    }

    const fullCss = cssParts.join("\n\n");
    const rules = compileCssToUbolRules(fullCss, this.domain);

    const backup: UbolBackup = {
      userResources: {
        userFilters: rules.join("\n"),
      },
      schemaVersion: 1,
    };

    return UbolBackupSchema.parse(backup);
  }

  public exportUbolConfig(): UbolConfig {
    const cleanHide = this.hideText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .sort();

    if (this.initialConfig) {
      const otherFilters = this.initialConfig.customFilters.filter(
        ([domain]) => domain !== this.domain,
      );
      const updatedFilters: [string, string[]][] =
        cleanHide.length > 0
          ? [...otherFilters, [this.domain, cleanHide]]
          : otherFilters;
      updatedFilters.sort(([a], [b]) => a.localeCompare(b));

      let sandboxRules: string[] = [];
      if (this.styleText.trim().length > 0) {
        const compiled = compileCssToUbolRules(this.styleText, this.domain);
        sandboxRules = compiled.filter((r) => r.includes(":style("));
      }

      const otherSandbox = (this.initialConfig.sandboxFilters ?? []).filter(
        (rule) => {
          const hashIdx = rule.indexOf("##");
          if (hashIdx === -1) return true;
          const ruleDomain = rule.slice(0, hashIdx).trim();
          return ruleDomain !== this.domain;
        },
      );
      const updatedSandbox = [...otherSandbox, ...sandboxRules].sort();

      return {
        ...this.initialConfig,
        customFilters: updatedFilters,
        ...(updatedSandbox.length > 0
          ? { sandboxFilters: updatedSandbox }
          : {}),
      };
    }

    const backup = this.exportBackup();
    return filterTextToUbolConfig(getFiltersFromBackup(backup));
  }

  public mount(container: HTMLElement = document.body): void {
    if (typeof document === "undefined") return;

    this.modalEl = document.createElement(
      "ubol-workbench",
    ) as UbolWorkbenchModal;

    const callbacks: WorkbenchModalCallbacks = {
      onHideChange: (text) => {
        this.hideText = text;
        this.recalculateAndApply();
      },
      onStyleChange: (text) => {
        this.styleText = text;
        this.recalculateAndApply();
      },
      onExport: () => {
        const config = this.exportUbolConfig();
        const blob = new Blob([JSON.stringify(config, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ubol-backup-${this.domain}.json`;
        a.click();
        URL.revokeObjectURL(url);
      },
      onRescanDiagnostics: () => {
        this.refreshDiagnostics();
      },
      onPlatformToggle: (newPlatform) => {
        this.platform = newPlatform;
        this.recalculateAndApply();
      },
    };

    this.modalEl.init(
      this.domain,
      this.platform,
      this.hideText,
      this.styleText,
      callbacks,
    );

    container.appendChild(this.modalEl);

    // Perception: listen to screen resize / matchMedia
    if (typeof window !== "undefined") {
      const mediaQuery = window.matchMedia("(max-width: 768px)");
      mediaQuery.addEventListener("change", (e) => {
        const detected = e.matches ? "mobile" : "desktop";
        if (detected !== this.platform) {
          this.platform = detected;
          this.modalEl?.updatePlatform(detected);
          this.recalculateAndApply();
        }
      });
    }

    this.refreshDiagnostics();
  }
}
