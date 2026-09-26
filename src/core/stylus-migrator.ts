import postcss from "postcss";
import nested from "postcss-nested";
import { AstFilterParser } from "@gorhill/ubo-core/js/static-filtering-parser.js";
import { normalizeSelector, splitSelectorList } from "./converter.ts";
import {
  filterTextToUbolConfig,
  isUbolConfig,
  ubolConfigToFilterText,
  type UbolConfig,
} from "./schema.ts";

export interface StylusSectionResult {
  cosmeticRules: string[];
  styleRules: string[];
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

  const selectorMap = new Map<string, SelectorStyles>();

  const getOrCreateSelector = (selector: string): SelectorStyles => {
    let entry = selectorMap.get(selector);
    if (!entry) {
      entry = {
        selector,
        lightDecls: new Map<string, string>(),
        darkDecls: new Map<string, string>(),
      };
      selectorMap.set(selector, entry);
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
    let isDarkMedia = false;
    let isLightMedia = false;

    let parent = rule.parent;
    while (parent && parent.type !== "root") {
      if (parent.type === "atrule" && parent.name === "media") {
        const params = parent.params.toLowerCase();
        if (/prefers-color-scheme\s*:\s*dark/.test(params)) {
          isDarkMedia = true;
        } else if (/prefers-color-scheme\s*:\s*light/.test(params)) {
          isLightMedia = true;
        }
      }
      parent = parent.parent;
    }

    const entry = getOrCreateSelector(normalizedSelector);

    rule.walkDecls((decl) => {
      const prop = decl.prop.trim();
      const val = decl.value.trim();

      if (isDarkMedia) {
        entry.darkDecls.set(prop, val);
      } else if (isLightMedia) {
        entry.lightDecls.set(prop, val);
      } else {
        // Base / light declaration
        entry.lightDecls.set(prop, val);
      }
    });
  });

  const cosmeticRules: string[] = [];
  const styleRules: string[] = [];
  let needsColorScheme = false;

  for (const entry of selectorMap.values()) {
    const allProps = new Set([
      ...entry.lightDecls.keys(),
      ...entry.darkDecls.keys(),
    ]);

    if (allProps.size === 0) continue;

    // Check if rule is pure cosmetic hide (only display: none)
    const isPureHide =
      allProps.size === 1 &&
      allProps.has("display") &&
      cleanDeclValue(entry.lightDecls.get("display") ?? "").toLowerCase() ===
        "none" &&
      (!entry.darkDecls.has("display") ||
        cleanDeclValue(entry.darkDecls.get("display") ?? "").toLowerCase() ===
          "none");

    if (isPureHide) {
      cosmeticRules.push(`${prefix}${entry.selector}`);
      continue;
    }

    // Build style declarations
    const formattedDecls: string[] = [];

    for (const prop of allProps) {
      const lightVal = entry.lightDecls.get(prop);
      const darkVal = entry.darkDecls.get(prop);

      if (lightVal !== undefined && darkVal !== undefined) {
        const cleanedLight = cleanDeclValue(lightVal);
        const cleanedDark = cleanDeclValue(darkVal);

        if (cleanedLight === cleanedDark) {
          formattedDecls.push(`${prop}: ${cleanedLight} !important;`);
        } else {
          formattedDecls.push(
            `${prop}: light-dark(${cleanedLight}, ${cleanedDark}) !important;`,
          );
          needsColorScheme = true;
        }
      } else if (lightVal !== undefined) {
        const cleanedLight = cleanDeclValue(lightVal);
        formattedDecls.push(`${prop}: ${cleanedLight} !important;`);
      } else if (darkVal !== undefined) {
        const cleanedDark = cleanDeclValue(darkVal);
        formattedDecls.push(
          `${prop}: light-dark(initial, ${cleanedDark}) !important;`,
        );
        needsColorScheme = true;
      }
    }

    if (formattedDecls.length > 0) {
      const declPayload = formattedDecls.join(" ");
      const combinedRule = `${prefix}${entry.selector}:style(${declPayload})`;
      const uboParser = new AstFilterParser();
      uboParser.parse(combinedRule);
      if (!uboParser.hasError() && uboParser.isCosmeticFilter()) {
        styleRules.push(combinedRule);
      } else {
        const subSelectors = splitSelectorList(entry.selector);
        for (const sub of subSelectors) {
          styleRules.push(`${prefix}${sub}:style(${declPayload})`);
        }
      }
    }
  }

  // Ensure color-scheme: light dark !important; is present if light-dark() is used
  if (needsColorScheme) {
    let hasColorSchemeSet = false;
    for (let i = 0; i < styleRules.length; i++) {
      const rule = styleRules[i];
      if (
        rule &&
        (rule.includes("##:root:style") || rule.includes("##html:style"))
      ) {
        if (!rule.includes("color-scheme:")) {
          // Insert color-scheme into this existing root rule
          styleRules[i] = rule.replace(
            /:style\(/,
            ":style(color-scheme: light dark !important; ",
          );
        }
        hasColorSchemeSet = true;
        break;
      }
    }

    if (!hasColorSchemeSet) {
      styleRules.unshift(
        `${prefix}:root:style(color-scheme: light dark !important;)`,
      );
    }
  }

  return {
    cosmeticRules,
    styleRules,
  };
};

export const migrateStylusJson = (
  input: unknown,
  existingConfig?: Partial<UbolConfig> | Record<string, unknown>,
): UbolConfig => {
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
