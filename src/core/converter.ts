import postcss from "postcss";
import nested from "postcss-nested";
import { AstFilterParser } from "@gorhill/ubo-core/js/static-filtering-parser.js";

export type Platform = "desktop" | "mobile";

interface SelectorStyles {
  selector: string;
  lightDecls: Map<string, string>;
  darkDecls: Map<string, string>;
}

const cleanDeclValue = (val: string): string => {
  return val.replace(/\s*!important\s*$/i, "").trim();
};

const matchesDomain = (domainPart: string, targetDomain: string): boolean => {
  if (domainPart.length === 0) return true;

  const tokens = domainPart
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const target = targetDomain.toLowerCase();

  for (const token of tokens) {
    if (token.startsWith("~")) {
      const negDomain = token.slice(1).toLowerCase();
      if (target === negDomain || target.endsWith(`.${negDomain}`)) {
        return false;
      }
    }
  }

  const positiveTokens = tokens.filter((t) => !t.startsWith("~"));
  if (positiveTokens.length === 0) return true;

  return positiveTokens.some((token) => {
    const pos = token.toLowerCase();
    return target === pos || target.endsWith(`.${pos}`);
  });
};

interface ParsedCosmeticPattern {
  selector: string;
  styleContent?: string;
}

const parseCosmeticPattern = (
  pattern: string,
): ParsedCosmeticPattern | null => {
  const styleIdx = pattern.indexOf(":style(");
  if (styleIdx === -1) {
    const selector = pattern.trim();
    return selector.length > 0 ? { selector } : null;
  }

  const openParenIdx = styleIdx + 6; // index of '(' in ':style('
  let depth = 0;
  let closeParenIdx = -1;

  for (let i = openParenIdx; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "(") {
      depth++;
    } else if (char === ")") {
      depth--;
      if (depth === 0) {
        closeParenIdx = i;
        break;
      }
    }
  }

  if (closeParenIdx === -1 || closeParenIdx !== pattern.length - 1) {
    // Malformed or unclosed style
    return null;
  }

  const selector = pattern.slice(0, styleIdx).trim();
  const styleContent = pattern.slice(openParenIdx + 1, closeParenIdx).trim();

  if (selector.length === 0) return null;

  return {
    selector,
    styleContent,
  };
};

export const parseUbolToCss = (
  filters: string,
  targetDomain: string,
  platform: Platform,
): string => {
  const lines = filters.split("\n");
  const cssBlocks: string[] = [];

  const ifStack: boolean[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    // Preprocessor directives
    if (line.startsWith("!#")) {
      if (line.startsWith("!#if")) {
        const rawExpr = line.slice(4).trim();
        const expr = rawExpr.replace(/^\((.*)\)$/, "$1").trim();
        let condition = false;

        if (expr === "env_mobile") {
          condition = platform === "mobile";
        } else if (expr === "!env_mobile") {
          condition = platform !== "mobile";
        }

        ifStack.push(condition);
      } else if (line.startsWith("!#else")) {
        if (ifStack.length > 0) {
          const current = ifStack.pop();
          ifStack.push(!current);
        }
      } else if (line.startsWith("!#endif")) {
        ifStack.pop();
      }
      continue;
    }

    // Ignore lines suppressed by inactive preprocessor branches
    if (ifStack.some((active) => !active)) {
      continue;
    }

    // Comments & network filters
    if (
      line.startsWith("!") ||
      (line.startsWith("#") &&
        !line.startsWith("##") &&
        !line.startsWith("#@#"))
    ) {
      continue;
    }

    const hashIdx = line.indexOf("##");
    if (hashIdx === -1) continue;

    const domainPart = line.slice(0, hashIdx).trim();
    const restPart = line.slice(hashIdx + 2).trim();

    if (!matchesDomain(domainPart, targetDomain)) {
      continue;
    }

    const parsed = parseCosmeticPattern(restPart);
    if (!parsed) continue;

    if (parsed.styleContent !== undefined) {
      const decls = parsed.styleContent
        .split(";")
        .map((d) => d.trim())
        .filter((d) => d.length > 0)
        .map((d) => `  ${d};`)
        .join("\n");

      cssBlocks.push(`${parsed.selector} {\n${decls}\n}`);
    } else {
      cssBlocks.push(`${parsed.selector} {\n  display: none !important;\n}`);
    }
  }

  return cssBlocks.join("\n\n");
};

export const compileCssToUbolRules = (
  css: string,
  domain: string,
): string[] => {
  if (css.trim().length === 0) return [];

  const prefix = domain.trim().length > 0 ? `${domain.trim()}##` : "##";

  // Process nesting first
  const processed = postcss([nested()]).process(css, { from: undefined }).root;

  // Verify at-rules: reject unsupported @media
  processed.walkAtRules((atRule) => {
    if (atRule.name === "media") {
      const params = atRule.params.toLowerCase();
      const isPrefersScheme =
        params.includes("prefers-color-scheme: dark") ||
        params.includes("prefers-color-scheme: light") ||
        params.includes("prefers-color-scheme:dark") ||
        params.includes("prefers-color-scheme:light");

      if (!isPrefersScheme) {
        throw new Error(
          `Unsupported @media query: ${atRule.params}. @media is strictly forbidden in uBOL rules.`,
        );
      }
    }
  });

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
    const normalizedSelector = rule.selector
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .join(", ");

    if (normalizedSelector.length === 0) return;

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
      styleRules.push(
        `${prefix}${entry.selector}:style(${formattedDecls.join(" ")})`,
      );
    }
  }

  if (needsColorScheme) {
    let hasColorSchemeSet = false;
    for (let i = 0; i < styleRules.length; i++) {
      const rule = styleRules[i];
      if (
        rule &&
        (rule.includes("##:root:style") || rule.includes("##html:style"))
      ) {
        if (!rule.includes("color-scheme:")) {
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

  const uboParser = new AstFilterParser();
  const allRules = [...cosmeticRules, ...styleRules];

  for (const rule of allRules) {
    uboParser.parse(rule);
    if (uboParser.hasError() || !uboParser.isCosmeticFilter()) {
      throw new Error(`Compiled uBO rule failed syntax validation: ${rule}`);
    }
  }

  return allRules;
};
