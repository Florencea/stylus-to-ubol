import postcss from "postcss";
import nested from "postcss-nested";
import { AstFilterParser } from "@gorhill/ubo-core/js/static-filtering-parser.js";
import {
  compileSelectorMapToRules,
  normalizeSelector,
  splitSelectorList,
  type SelectorStyles,
} from "./converter.ts";
import {
  filterTextToUbolConfig,
  isUbolConfig,
  ubolConfigToFilterText,
  type UbolConfig,
} from "./schema.ts";

export type RuleScope = "global" | "desktop" | "mobile";

export interface StylusSectionResult {
  cosmeticRules: string[];
  styleRules: string[];
  scopedCosmeticRules?: Record<RuleScope, string[]>;
  scopedStyleRules?: Record<RuleScope, string[]>;
}

export interface DualUbolConfig {
  desktop: UbolConfig;
  mobile: UbolConfig;
}

export interface AllUbolConfigs {
  desktop: UbolConfig;
  mobile: UbolConfig;
  complete: UbolConfig;
}

interface StylusSection {
  code?: string;
  domains?: string[];
  urlPrefixes?: string[];
  urls?: string[];
}

interface StylusStyle {
  id?: number | string;
  name?: string;
  enabled?: boolean;
  sections?: StylusSection[];
}

const extractDomainsFromSection = (section: StylusSection): string[] => {
  const domains = new Set<string>();

  if (Array.isArray(section.domains)) {
    for (const d of section.domains) {
      const trimmed = d.trim();
      if (trimmed.length > 0) {
        domains.add(trimmed);
      }
    }
  }

  const urlCandidates = [
    ...(Array.isArray(section.urls) ? section.urls : []),
    ...(Array.isArray(section.urlPrefixes) ? section.urlPrefixes : []),
  ];

  for (const candidate of urlCandidates) {
    try {
      const parsed = new URL(candidate);
      if (parsed.hostname.length > 0) {
        domains.add(parsed.hostname);
      }
    } catch {
      // Ignore invalid URL candidates
    }
  }

  return Array.from(domains);
};

export const parseStylusSection = (
  css: string,
  domains?: string[],
  defaultScope: RuleScope = "global",
): StylusSectionResult => {
  const cleanedDomains = domains
    ? domains.map((d) => d.trim()).filter((d) => d.length > 0)
    : [];
  const hasDomains =
    cleanedDomains.length > 0 &&
    !(cleanedDomains.length === 1 && cleanedDomains[0] === "*");
  const domainPrefix = hasDomains ? cleanedDomains.join(",") : "*";
  const prefix = `${domainPrefix}##`;

  // Process nesting first with postcss-nested
  const processed = postcss([nested()]).process(css, { from: undefined }).root;

  const scopeMap = new Map<RuleScope, Map<string, SelectorStyles>>([
    ["global", new Map<string, SelectorStyles>()],
    ["desktop", new Map<string, SelectorStyles>()],
    ["mobile", new Map<string, SelectorStyles>()],
  ]);

  const getOrCreateSelector = (
    selector: string,
    scope: RuleScope,
  ): SelectorStyles => {
    let map = scopeMap.get(scope);
    if (!map) {
      map = new Map<string, SelectorStyles>();
      scopeMap.set(scope, map);
    }
    let entry = map.get(selector);
    if (!entry) {
      entry = {
        selector,
        baseDecls: new Map<string, string>(),
        lightDecls: new Map<string, string>(),
        darkDecls: new Map<string, string>(),
      };
      map.set(selector, entry);
    }
    return entry;
  };

  processed.walkRules((rule) => {
    // Normalize selector (normalize whitespace across multiline selectors)
    const rawSelectors = splitSelectorList(rule.selector);
    const normalizedSelector = rawSelectors
      .map((s) => normalizeSelector(s))
      .filter((s) => s.length > 0)
      .join(", ");

    if (normalizedSelector.length === 0) return;

    // Check if this rule is nested inside @media (prefers-color-scheme: dark) or light
    // and whether pointer media query designates desktop vs mobile scope
    let isDarkMedia = false;
    let isLightMedia = false;
    let ruleScope: RuleScope = defaultScope;

    let parent = rule.parent;
    while (parent && parent.type !== "root") {
      if (parent.type === "atrule" && parent.name === "media") {
        const params = parent.params.toLowerCase();
        if (/prefers-color-scheme\s*:\s*dark/.test(params)) {
          isDarkMedia = true;
        } else if (/prefers-color-scheme\s*:\s*light/.test(params)) {
          isLightMedia = true;
        }

        if (/pointer\s*:\s*coarse/.test(params)) {
          if (/not\s+.*pointer\s*:\s*coarse/.test(params)) {
            ruleScope = "desktop";
          } else {
            ruleScope = "mobile";
          }
        } else if (/pointer\s*:\s*fine/.test(params)) {
          ruleScope = "desktop";
        }
      }
      parent = parent.parent;
    }

    const entry = getOrCreateSelector(normalizedSelector, ruleScope);

    rule.walkDecls((decl) => {
      const prop = decl.prop.trim();
      const val = decl.value.trim();

      if (isDarkMedia) {
        entry.darkDecls.set(prop, val);
      } else if (isLightMedia) {
        entry.lightDecls.set(prop, val);
      } else {
        entry.baseDecls.set(prop, val);
      }
    });
  });

  const scopedCosmeticRules: Record<RuleScope, string[]> = {
    global: [],
    desktop: [],
    mobile: [],
  };
  const scopedStyleRules: Record<RuleScope, string[]> = {
    global: [],
    desktop: [],
    mobile: [],
  };

  const scopes: RuleScope[] = ["global", "desktop", "mobile"];

  for (const scope of scopes) {
    const selectorMap = scopeMap.get(scope);
    if (!selectorMap) continue;

    const { cosmeticRules, styleRules } = compileSelectorMapToRules(
      selectorMap,
      prefix,
    );
    scopedCosmeticRules[scope] = cosmeticRules;
    scopedStyleRules[scope] = styleRules;
  }

  const cosmeticRules = [
    ...scopedCosmeticRules.global,
    ...scopedCosmeticRules.desktop,
    ...scopedCosmeticRules.mobile,
  ];
  const styleRules = [
    ...scopedStyleRules.global,
    ...scopedStyleRules.desktop,
    ...scopedStyleRules.mobile,
  ];

  return {
    cosmeticRules,
    styleRules,
    scopedCosmeticRules,
    scopedStyleRules,
  };
};

const splitFilterTextToDual = (
  filterText: string,
): { desktop: string[]; mobile: string[] } => {
  const lines = filterText.split("\n");
  const desktopLines: string[] = [];
  const mobileLines: string[] = [];
  const ifStack: { env: "mobile" | "not_mobile" | "unknown" }[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("!#if")) {
      const expr = line.slice(4).replace(/[()]/g, "").trim();
      if (expr === "env_mobile") {
        ifStack.push({ env: "mobile" });
      } else if (expr === "!env_mobile") {
        ifStack.push({ env: "not_mobile" });
      } else {
        ifStack.push({ env: "unknown" });
      }
      continue;
    }
    if (line.startsWith("!#else")) {
      const top = ifStack.pop();
      if (top?.env === "mobile") {
        ifStack.push({ env: "not_mobile" });
      } else if (top?.env === "not_mobile") {
        ifStack.push({ env: "mobile" });
      } else {
        ifStack.push({ env: "unknown" });
      }
      continue;
    }
    if (line.startsWith("!#endif")) {
      ifStack.pop();
      continue;
    }

    const currentBranch = ifStack[ifStack.length - 1]?.env;
    if (currentBranch === "mobile") {
      mobileLines.push(rawLine);
    } else if (currentBranch === "not_mobile") {
      desktopLines.push(rawLine);
    } else {
      desktopLines.push(rawLine);
      mobileLines.push(rawLine);
    }
  }

  return { desktop: desktopLines, mobile: mobileLines };
};

export const migrateStylusJsonAll = (
  input: unknown,
  existingConfig?:
    | {
        desktop?: Partial<UbolConfig> | Record<string, unknown>;
        mobile?: Partial<UbolConfig> | Record<string, unknown>;
        complete?: Partial<UbolConfig> | Record<string, unknown>;
      }
    | Partial<UbolConfig>
    | Record<string, unknown>,
): AllUbolConfigs => {
  let parsedJson: unknown;

  const existingDesktop =
    existingConfig && "desktop" in existingConfig && existingConfig.desktop
      ? existingConfig.desktop
      : existingConfig &&
          !("mobile" in existingConfig) &&
          !("complete" in existingConfig)
        ? existingConfig
        : undefined;

  const existingMobile =
    existingConfig && "mobile" in existingConfig && existingConfig.mobile
      ? existingConfig.mobile
      : existingConfig &&
          !("desktop" in existingConfig) &&
          !("complete" in existingConfig)
        ? existingConfig
        : undefined;

  const existingComplete =
    existingConfig && "complete" in existingConfig && existingConfig.complete
      ? existingConfig.complete
      : existingConfig &&
          !("desktop" in existingConfig) &&
          !("mobile" in existingConfig)
        ? existingConfig
        : undefined;

  if (typeof input === "string") {
    try {
      parsedJson = JSON.parse(input);
    } catch (err) {
      if (input.includes("##")) {
        const { desktop: dLines, mobile: mLines } =
          splitFilterTextToDual(input);
        return {
          desktop: filterTextToUbolConfig(dLines.join("\n"), existingDesktop),
          mobile: filterTextToUbolConfig(mLines.join("\n"), existingMobile),
          complete: filterTextToUbolConfig(input, existingComplete),
        };
      }
      throw new Error(
        `Failed to parse Stylus JSON: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
  } else {
    parsedJson = input;
  }

  if (
    parsedJson !== null &&
    typeof parsedJson === "object" &&
    "userResources" in parsedJson
  ) {
    const userResources = (
      parsedJson as { userResources?: { userFilters?: unknown } }
    ).userResources;
    const rawFilters =
      typeof userResources?.userFilters === "string"
        ? userResources.userFilters
        : "";
    const { desktop: dLines, mobile: mLines } =
      splitFilterTextToDual(rawFilters);
    return {
      desktop: filterTextToUbolConfig(dLines.join("\n"), existingDesktop),
      mobile: filterTextToUbolConfig(mLines.join("\n"), existingMobile),
      complete: filterTextToUbolConfig(rawFilters, existingComplete),
    };
  }

  if (isUbolConfig(parsedJson)) {
    const rawFilters = ubolConfigToFilterText(parsedJson);
    const { desktop: dLines, mobile: mLines } =
      splitFilterTextToDual(rawFilters);
    return {
      desktop: filterTextToUbolConfig(
        dLines.join("\n"),
        existingDesktop ?? parsedJson,
      ),
      mobile: filterTextToUbolConfig(
        mLines.join("\n"),
        existingMobile ?? parsedJson,
      ),
      complete: filterTextToUbolConfig(
        rawFilters,
        existingComplete ?? parsedJson,
      ),
    };
  }

  const styles: StylusStyle[] = [];

  if (Array.isArray(parsedJson)) {
    styles.push(...(parsedJson as StylusStyle[]));
  } else if (parsedJson && typeof parsedJson === "object") {
    if (
      "sections" in parsedJson &&
      Array.isArray((parsedJson as StylusStyle).sections)
    ) {
      styles.push(parsedJson as StylusStyle);
    } else if (
      "styles" in parsedJson &&
      Array.isArray((parsedJson as { styles: StylusStyle[] }).styles)
    ) {
      styles.push(...(parsedJson as { styles: StylusStyle[] }).styles);
    }
  }

  const desktopRules: string[] = [];
  const mobileRules: string[] = [];
  const completeRules: string[] = [];
  const uboParser = new AstFilterParser();
  const validatedRules = new Set<string>();

  const validateRule = (rule: string): void => {
    if (validatedRules.has(rule)) return;
    uboParser.parse(rule);
    if (uboParser.hasError() || !uboParser.isCosmeticFilter()) {
      throw new Error(`Generated uBO rule failed syntax validation: ${rule}`);
    }
    validatedRules.add(rule);
  };

  for (const style of styles) {
    if (style.enabled === false) continue;
    if (!style.sections) continue;

    const styleName = (style.name ?? "").toLowerCase();
    let defaultScope: RuleScope = "global";
    if (styleName.includes("mobile") && !styleName.includes("desktop")) {
      defaultScope = "mobile";
    } else if (
      styleName.includes("desktop-only") ||
      styleName.includes("desktop only")
    ) {
      defaultScope = "desktop";
    }

    for (const section of style.sections) {
      if (!section.code || section.code.trim().length === 0) continue;

      const domains = extractDomainsFromSection(section);
      const { scopedCosmeticRules, scopedStyleRules } = parseStylusSection(
        section.code,
        domains,
        defaultScope,
      );

      const globalRules = [
        ...(scopedCosmeticRules?.global ?? []),
        ...(scopedStyleRules?.global ?? []),
      ];
      const desktopOnlyRules = [
        ...(scopedCosmeticRules?.desktop ?? []),
        ...(scopedStyleRules?.desktop ?? []),
      ];
      const mobileOnlyRules = [
        ...(scopedCosmeticRules?.mobile ?? []),
        ...(scopedStyleRules?.mobile ?? []),
      ];

      for (const rule of [...globalRules, ...desktopOnlyRules]) {
        validateRule(rule);
        desktopRules.push(rule);
      }

      for (const rule of [...globalRules, ...mobileOnlyRules]) {
        validateRule(rule);
        mobileRules.push(rule);
      }

      for (const rule of [
        ...globalRules,
        ...desktopOnlyRules,
        ...mobileOnlyRules,
      ]) {
        validateRule(rule);
        completeRules.push(rule);
      }
    }
  }

  return {
    desktop: filterTextToUbolConfig(desktopRules.join("\n"), existingDesktop),
    mobile: filterTextToUbolConfig(mobileRules.join("\n"), existingMobile),
    complete: filterTextToUbolConfig(
      completeRules.join("\n"),
      existingComplete,
    ),
  };
};

export const migrateStylusJsonDual = (
  input: unknown,
  existingConfig?:
    | {
        desktop?: Partial<UbolConfig> | Record<string, unknown>;
        mobile?: Partial<UbolConfig> | Record<string, unknown>;
      }
    | Partial<UbolConfig>
    | Record<string, unknown>,
): DualUbolConfig => {
  const result = migrateStylusJsonAll(input, existingConfig);
  return {
    desktop: result.desktop,
    mobile: result.mobile,
  };
};

export const migrateStylusJson = (
  input: unknown,
  existingConfig?: Partial<UbolConfig> | Record<string, unknown>,
  options?: { target?: "all" | "desktop" | "mobile" },
): UbolConfig => {
  const result = migrateStylusJsonAll(input, existingConfig);
  if (options?.target === "desktop") {
    return result.desktop;
  }
  if (options?.target === "mobile") {
    return result.mobile;
  }
  return result.complete;
};
