import {
  compileCssToUbolRules,
  parseUbolToCss,
  splitSelectorList,
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
  type RuleScope,
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
  const hideLines = splitSelectorList(hideText, { splitOnNewlines: true });

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

      const subSelectors = splitSelectorList(rawSelector);

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
  public currentScope: RuleScope = "global";
  public injectedStyleEl: HTMLStyleElement;
  public modalEl: UbolWorkbenchModal | null = null;
  public initialConfig: UbolConfig | null = null;

  public scopedHide: Record<RuleScope, string> = {
    global: "",
    desktop: "",
    mobile: "",
  };
  public scopedStyle: Record<RuleScope, string> = {
    global: "",
    desktop: "",
    mobile: "",
  };

  get hideText(): string {
    return this.scopedHide[this.currentScope];
  }
  set hideText(val: string) {
    this.scopedHide[this.currentScope] = val;
  }

  get styleText(): string {
    return this.scopedStyle[this.currentScope];
  }
  set styleText(val: string) {
    this.scopedStyle[this.currentScope] = val;
  }

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
    const lines = filters.split("\n");
    const globalLines: string[] = [];
    const desktopLines: string[] = [];
    const mobileLines: string[] = [];
    const ifStack: ("mobile" | "desktop" | "other")[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.startsWith("!#if")) {
        const expr = line.slice(4).replace(/[()]/g, "").trim();
        if (expr === "env_mobile") ifStack.push("mobile");
        else if (expr === "!env_mobile") ifStack.push("desktop");
        else ifStack.push("other");
        continue;
      }
      if (line.startsWith("!#else")) {
        const top = ifStack.pop();
        if (top === "mobile") ifStack.push("desktop");
        else if (top === "desktop") ifStack.push("mobile");
        else ifStack.push("other");
        continue;
      }
      if (line.startsWith("!#endif")) {
        ifStack.pop();
        continue;
      }

      const activeEnv = ifStack[ifStack.length - 1];
      if (activeEnv === "mobile") mobileLines.push(rawLine);
      else if (activeEnv === "desktop") desktopLines.push(rawLine);
      else globalLines.push(rawLine);
    }

    const parseSectionToTexts = (
      sectionLines: string[],
      plat: Platform,
    ): { hide: string; style: string } => {
      const rawCss = parseUbolToCss(sectionLines.join("\n"), this.domain, plat);
      const hideSels: string[] = [];
      const styleBlks: string[] = [];
      for (const blk of rawCss.split("\n\n")) {
        const trimmed = blk.trim();
        if (!trimmed) continue;
        const openBr = trimmed.indexOf("{");
        const closeBr = trimmed.lastIndexOf("}");
        if (openBr === -1 || closeBr === -1) continue;
        const sel = trimmed.slice(0, openBr).trim();
        const body = trimmed.slice(openBr + 1, closeBr).trim();
        if (body === "display: none !important;") hideSels.push(sel);
        else styleBlks.push(trimmed);
      }
      return { hide: hideSels.join(", "), style: styleBlks.join("\n\n") };
    };

    const globalParsed = parseSectionToTexts(globalLines, this.platform);
    this.scopedHide.global = globalParsed.hide;
    this.scopedStyle.global = globalParsed.style;

    if (desktopLines.length > 0) {
      const dParsed = parseSectionToTexts(desktopLines, "desktop");
      this.scopedHide.desktop = dParsed.hide;
      this.scopedStyle.desktop = dParsed.style;
    }
    if (mobileLines.length > 0) {
      const mParsed = parseSectionToTexts(mobileLines, "mobile");
      this.scopedHide.mobile = mParsed.hide;
      this.scopedStyle.mobile = mParsed.style;
    }

    this.recalculateAndApply();
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

    this.scopedHide[this.currentScope] = hideSelectors.join(", ");
    this.scopedStyle[this.currentScope] = styleBlocks.join("\n\n");
    this.recalculateAndApply();
  }

  public recalculateAndApply(): void {
    const cssParts: string[] = [];

    const activeHideSels = [
      this.scopedHide.global,
      this.platform === "mobile"
        ? this.scopedHide.mobile
        : this.scopedHide.desktop,
    ]
      .filter((s) => s.trim().length > 0)
      .join(", ");

    const cleanHide = splitSelectorList(activeHideSels, {
      splitOnNewlines: true,
    }).join(", ");

    if (cleanHide.length > 0) {
      cssParts.push(`${cleanHide} {\n  display: none !important;\n}`);
    }

    const activeStyleBlks = [
      this.scopedStyle.global,
      this.platform === "mobile"
        ? this.scopedStyle.mobile
        : this.scopedStyle.desktop,
    ]
      .filter((s) => s.trim().length > 0)
      .join("\n\n");

    if (activeStyleBlks.trim().length > 0) {
      cssParts.push(activeStyleBlks.trim());
    }

    const combinedCss = cssParts.join("\n\n");
    this.injectedStyleEl.textContent = combinedCss;

    this.refreshDiagnostics();
  }

  public refreshDiagnostics(): void {
    if (typeof document === "undefined" || !this.modalEl) return;
    const activeHide = [
      this.scopedHide.global,
      this.platform === "mobile"
        ? this.scopedHide.mobile
        : this.scopedHide.desktop,
    ]
      .filter((s) => s.trim().length > 0)
      .join(", ");

    const activeStyle = [
      this.scopedStyle.global,
      this.platform === "mobile"
        ? this.scopedStyle.mobile
        : this.scopedStyle.desktop,
    ]
      .filter((s) => s.trim().length > 0)
      .join("\n\n");

    const items = diagnoseDeadCode(activeHide, activeStyle, document);
    this.modalEl.updateDiagnostics(items);
  }

  public exportBackup(): UbolBackup {
    const compileScope = (hideText: string, styleText: string): string[] => {
      const parts: string[] = [];
      const cleanHide = splitSelectorList(hideText, {
        splitOnNewlines: true,
      }).join(", ");

      if (cleanHide.length > 0) {
        parts.push(`${cleanHide} {\n  display: none !important;\n}`);
      }

      if (styleText.trim().length > 0) {
        parts.push(styleText.trim());
      }

      return parts.length > 0
        ? compileCssToUbolRules(parts.join("\n\n"), this.domain)
        : [];
    };

    const globalRules = compileScope(
      this.scopedHide.global,
      this.scopedStyle.global,
    );
    const desktopRules = compileScope(
      this.scopedHide.desktop,
      this.scopedStyle.desktop,
    );
    const mobileRules = compileScope(
      this.scopedHide.mobile,
      this.scopedStyle.mobile,
    );

    const filterLines: string[] = [];
    if (globalRules.length > 0) {
      filterLines.push(...globalRules);
    }
    if (desktopRules.length > 0) {
      filterLines.push("!#if !env_mobile");
      filterLines.push(...desktopRules);
      filterLines.push("!#endif");
    }
    if (mobileRules.length > 0) {
      filterLines.push("!#if env_mobile");
      filterLines.push(...mobileRules);
      filterLines.push("!#endif");
    }

    const backup: UbolBackup = {
      userResources: {
        userFilters: filterLines.join("\n"),
      },
      schemaVersion: 1,
    };

    return UbolBackupSchema.parse(backup);
  }

  public exportDualConfig(): { desktop: UbolConfig; mobile: UbolConfig } {
    const compileToConfig = (
      hideText: string,
      styleText: string,
    ): UbolConfig => {
      const cleanHide = splitSelectorList(hideText, {
        splitOnNewlines: true,
      }).sort();
      let sandboxRules: string[] = [];
      if (styleText.trim().length > 0) {
        const compiled = compileCssToUbolRules(styleText, this.domain);
        sandboxRules = compiled.filter((r) => r.includes(":style("));
      }
      return filterTextToUbolConfig(
        [...cleanHide.map((s) => `${this.domain}##${s}`), ...sandboxRules].join(
          "\n",
        ),
        this.initialConfig ?? undefined,
      );
    };

    const desktopHide = [this.scopedHide.global, this.scopedHide.desktop]
      .filter((s) => s.trim().length > 0)
      .join(", ");
    const desktopStyle = [this.scopedStyle.global, this.scopedStyle.desktop]
      .filter((s) => s.trim().length > 0)
      .join("\n\n");

    const mobileHide = [this.scopedHide.global, this.scopedHide.mobile]
      .filter((s) => s.trim().length > 0)
      .join(", ");
    const mobileStyle = [this.scopedStyle.global, this.scopedStyle.mobile]
      .filter((s) => s.trim().length > 0)
      .join("\n\n");

    return {
      desktop: compileToConfig(desktopHide, desktopStyle),
      mobile: compileToConfig(mobileHide, mobileStyle),
    };
  }

  public exportUbolConfig(): UbolConfig {
    const activeHideSels = [
      this.scopedHide.global,
      this.platform === "mobile"
        ? this.scopedHide.mobile
        : this.scopedHide.desktop,
    ]
      .filter((s) => s.trim().length > 0)
      .join(", ");

    const cleanHide = splitSelectorList(activeHideSels, {
      splitOnNewlines: true,
    }).sort();

    const activeStyleText = [
      this.scopedStyle.global,
      this.platform === "mobile"
        ? this.scopedStyle.mobile
        : this.scopedStyle.desktop,
    ]
      .filter((s) => s.trim().length > 0)
      .join("\n\n");

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
      if (activeStyleText.trim().length > 0) {
        const compiled = compileCssToUbolRules(activeStyleText, this.domain);
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
      onHideChange: (text, scope) => {
        const targetScope = scope ?? this.currentScope;
        this.scopedHide[targetScope] = text;
        this.recalculateAndApply();
      },
      onStyleChange: (text, scope) => {
        const targetScope = scope ?? this.currentScope;
        this.scopedStyle[targetScope] = text;
        this.recalculateAndApply();
      },
      onScopeChange: (scope) => {
        this.currentScope = scope;
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
      this.scopedHide.global,
      this.scopedStyle.global,
      callbacks,
    );

    this.modalEl.setScopeContent(
      "desktop",
      this.scopedHide.desktop,
      this.scopedStyle.desktop,
    );
    this.modalEl.setScopeContent(
      "mobile",
      this.scopedHide.mobile,
      this.scopedStyle.mobile,
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
