import postcss from "postcss";
import nested from "postcss-nested";
import { AstFilterParser } from "@gorhill/ubo-core/js/static-filtering-parser.js";
import {
  isFilterProperty,
  normalizeSelector,
  splitSelectorList,
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

interface SelectorStyles {
  selector: string;
  baseDecls: Map<string, string>;
  lightDecls: Map<string, string>;
  darkDecls: Map<string, string>;
}

const cleanDeclValue = (val: string): string => {
  return val.replace(/\s*!important\s*$/i, "").trim();
};

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
    let needsColorScheme = false;

    for (const entry of selectorMap.values()) {
      const allProps = new Set([
        ...entry.baseDecls.keys(),
        ...entry.lightDecls.keys(),
        ...entry.darkDecls.keys(),
      ]);

      if (allProps.size === 0) continue;

      // Check if rule is pure cosmetic hide (only display: none)
      const isPureHide =
        allProps.size === 1 &&
        allProps.has("display") &&
        cleanDeclValue(
          entry.baseDecls.get("display") ??
            entry.lightDecls.get("display") ??
            "",
        ).toLowerCase() === "none" &&
        (!entry.darkDecls.has("display") ||
          cleanDeclValue(entry.darkDecls.get("display") ?? "").toLowerCase() ===
            "none");

      if (isPureHide) {
        scopedCosmeticRules[scope].push(`${prefix}${entry.selector}`);
        continue;
      }

      // Build style declarations
      const baseFormattedDecls: string[] = [];
      const baseFilterDecls: string[] = [];
      const lightFilterDecls: string[] = [];
      const darkFilterDecls: string[] = [];

      for (const prop of allProps) {
        const baseVal = entry.baseDecls.get(prop);
        const lightVal = entry.lightDecls.get(prop);
        const darkVal = entry.darkDecls.get(prop);

        if (isFilterProperty(prop)) {
          if (baseVal !== undefined) {
            baseFilterDecls.push(
              `${prop}: ${cleanDeclValue(baseVal)} !important;`,
            );
          }
          if (
            lightVal !== undefined &&
            (baseVal === undefined ||
              cleanDeclValue(baseVal) !== cleanDeclValue(lightVal))
          ) {
            lightFilterDecls.push(
              `${prop}: ${cleanDeclValue(lightVal)} !important;`,
            );
          }
          if (
            darkVal !== undefined &&
            (baseVal === undefined ||
              cleanDeclValue(baseVal) !== cleanDeclValue(darkVal))
          ) {
            darkFilterDecls.push(
              `${prop}: ${cleanDeclValue(darkVal)} !important;`,
            );
          }
        } else {
          const effectiveLight = lightVal ?? baseVal;

          if (effectiveLight !== undefined && darkVal !== undefined) {
            const cleanedLight = cleanDeclValue(effectiveLight);
            const cleanedDark = cleanDeclValue(darkVal);

            if (cleanedLight === cleanedDark) {
              baseFormattedDecls.push(`${prop}: ${cleanedLight} !important;`);
            } else {
              baseFormattedDecls.push(
                `${prop}: light-dark(${cleanedLight}, ${cleanedDark}) !important;`,
              );
              needsColorScheme = true;
            }
          } else if (effectiveLight !== undefined) {
            const cleanedLight = cleanDeclValue(effectiveLight);
            baseFormattedDecls.push(`${prop}: ${cleanedLight} !important;`);
          } else if (darkVal !== undefined) {
            const cleanedDark = cleanDeclValue(darkVal);
            baseFormattedDecls.push(
              `${prop}: light-dark(initial, ${cleanedDark}) !important;`,
            );
            needsColorScheme = true;
          }
        }
      }

      const subSelectors = splitSelectorList(entry.selector);
      const unconditionalDecls = [...baseFormattedDecls, ...baseFilterDecls];

      if (unconditionalDecls.length > 0) {
        const declPayload = unconditionalDecls.join(" ");
        for (const sub of subSelectors) {
          scopedStyleRules[scope].push(`${prefix}${sub}:style(${declPayload})`);
        }
      }

      if (lightFilterDecls.length > 0) {
        const declPayload = lightFilterDecls.join(" ");
        for (const sub of subSelectors) {
          scopedStyleRules[scope].push(
            `${prefix}:matches-media((prefers-color-scheme: light)) ${sub}:style(${declPayload})`,
          );
        }
      }

      if (darkFilterDecls.length > 0) {
        const declPayload = darkFilterDecls.join(" ");
        for (const sub of subSelectors) {
          scopedStyleRules[scope].push(
            `${prefix}:matches-media((prefers-color-scheme: dark)) ${sub}:style(${declPayload})`,
          );
        }
      }
    }

    if (needsColorScheme) {
      let hasColorSchemeSet = false;
      const rules = scopedStyleRules[scope];
      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        if (
          rule &&
          (rule.includes("##:root:style") || rule.includes("##html:style"))
        ) {
          if (!rule.includes("color-scheme:")) {
            rules[i] = rule.replace(
              /:style\(/,
              ":style(color-scheme: light dark !important; ",
            );
          }
          hasColorSchemeSet = true;
          break;
        }
      }

      if (!hasColorSchemeSet) {
        rules.unshift(
          `${prefix}:root:style(color-scheme: light dark !important;)`,
        );
      }
    }
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
  let parsedJson: unknown;

  if (typeof input === "string") {
    try {
      parsedJson = JSON.parse(input);
    } catch (err) {
      if (input.includes("##")) {
        const { desktop: dLines, mobile: mLines } =
          splitFilterTextToDual(input);
        const existingDesktop =
          existingConfig &&
          "desktop" in existingConfig &&
          existingConfig.desktop
            ? existingConfig.desktop
            : existingConfig && !("mobile" in existingConfig)
              ? existingConfig
              : undefined;
        const existingMobile =
          existingConfig && "mobile" in existingConfig && existingConfig.mobile
            ? existingConfig.mobile
            : existingConfig && !("desktop" in existingConfig)
              ? existingConfig
              : undefined;
        return {
          desktop: filterTextToUbolConfig(dLines.join("\n"), existingDesktop),
          mobile: filterTextToUbolConfig(mLines.join("\n"), existingMobile),
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

  const existingDesktop =
    existingConfig && "desktop" in existingConfig && existingConfig.desktop
      ? existingConfig.desktop
      : existingConfig && !("mobile" in existingConfig)
        ? existingConfig
        : undefined;

  const existingMobile =
    existingConfig && "mobile" in existingConfig && existingConfig.mobile
      ? existingConfig.mobile
      : existingConfig && !("desktop" in existingConfig)
        ? existingConfig
        : undefined;

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
  const uboParser = new AstFilterParser();

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
        uboParser.parse(rule);
        if (uboParser.hasError() || !uboParser.isCosmeticFilter()) {
          throw new Error(
            `Generated uBO desktop rule failed syntax validation: ${rule}`,
          );
        }
        desktopRules.push(rule);
      }

      for (const rule of [...globalRules, ...mobileOnlyRules]) {
        uboParser.parse(rule);
        if (uboParser.hasError() || !uboParser.isCosmeticFilter()) {
          throw new Error(
            `Generated uBO mobile rule failed syntax validation: ${rule}`,
          );
        }
        mobileRules.push(rule);
      }
    }
  }

  return {
    desktop: filterTextToUbolConfig(desktopRules.join("\n"), existingDesktop),
    mobile: filterTextToUbolConfig(mobileRules.join("\n"), existingMobile),
  };
};

export const migrateStylusJson = (
  input: unknown,
  existingConfig?: Partial<UbolConfig> | Record<string, unknown>,
  options?: { target?: "all" | "desktop" | "mobile" },
): UbolConfig => {
  if (options?.target === "desktop") {
    return migrateStylusJsonDual(input, existingConfig).desktop;
  }
  if (options?.target === "mobile") {
    return migrateStylusJsonDual(input, existingConfig).mobile;
  }
  let parsedJson: unknown;

  if (typeof input === "string") {
    try {
      parsedJson = JSON.parse(input);
    } catch (err) {
      if (input.includes("##")) {
        return filterTextToUbolConfig(input, existingConfig);
      }
      throw new Error(
        `Failed to parse Stylus JSON: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
  } else {
    parsedJson = input;
  }

  // Handle case where input is already a legacy uBO backup (e.g. ubol-config-1.json)
  if (
    parsedJson !== null &&
    typeof parsedJson === "object" &&
    "userResources" in parsedJson
  ) {
    const userResources = parsedJson.userResources;
    if (
      userResources !== null &&
      typeof userResources === "object" &&
      "userFilters" in userResources
    ) {
      const rawUserFilters = userResources.userFilters;
      const rawFilters =
        typeof rawUserFilters === "string" ? rawUserFilters : "";
      return filterTextToUbolConfig(rawFilters, existingConfig);
    }
  }

  // Handle case where input is already a native uBOL config
  if (isUbolConfig(parsedJson)) {
    return filterTextToUbolConfig(
      ubolConfigToFilterText(parsedJson),
      existingConfig ?? parsedJson,
    );
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

  const allRules: string[] = [];
  const uboParser = new AstFilterParser();

  for (const style of styles) {
    if (style.enabled === false) continue;
    if (!style.sections) continue;

    for (const section of style.sections) {
      if (!section.code || section.code.trim().length === 0) continue;

      const domains = extractDomainsFromSection(section);
      const { cosmeticRules, styleRules } = parseStylusSection(
        section.code,
        domains,
      );

      for (const rule of [...cosmeticRules, ...styleRules]) {
        uboParser.parse(rule);
        if (uboParser.hasError() || !uboParser.isCosmeticFilter()) {
          throw new Error(
            `Generated uBO rule failed syntax validation: ${rule}`,
          );
        }
        allRules.push(rule);
      }
    }
  }

  return filterTextToUbolConfig(allRules.join("\n"), existingConfig);
};
