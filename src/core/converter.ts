import postcss from "postcss";
import nested from "postcss-nested";
import { AstFilterParser } from "@gorhill/ubo-core/js/static-filtering-parser.js";

export type Platform = "desktop" | "mobile";

export const isFilterProperty = (prop: string): boolean => {
  return /^(?:-webkit-)?(?:backdrop-)?filter$/i.test(prop);
};

export const extractMatchesMedia = (
  selector: string,
): { mediaQuery: string; restSelector: string } | null => {
  const match = /^:matches-media\(/.exec(selector);
  if (!match) return null;

  const startIdx = match[0].length - 1;
  let depth = 0;
  let closeIdx = -1;

  for (let i = startIdx; i < selector.length; i++) {
    if (selector[i] === "(") {
      depth++;
    } else if (selector[i] === ")") {
      depth--;
      if (depth === 0) {
        closeIdx = i;
        break;
      }
    }
  }

  if (closeIdx === -1) return null;

  let mediaQuery = selector.slice(startIdx + 1, closeIdx).trim();
  const restSelector = selector.slice(closeIdx + 1).trim();

  if (
    !mediaQuery.startsWith("(") &&
    !mediaQuery.startsWith("not ") &&
    !mediaQuery.startsWith("only ")
  ) {
    mediaQuery = `(${mediaQuery})`;
  }

  return { mediaQuery, restSelector };
};

interface SelectorStyles {
  selector: string;
  baseDecls: Map<string, string>;
  lightDecls: Map<string, string>;
  darkDecls: Map<string, string>;
}

const cleanDeclValue = (val: string): string => {
  return val.replace(/\s*!important\s*$/i, "").trim();
};

export const normalizeSelector = (selector: string): string => {
  return selector
    .replace(
      /(?<!:):(before|after|first-letter|first-line|placeholder)\b/g,
      "::$1",
    )
    .trim();
};

export const splitSelectorList = (
  selector: string,
  options?: { splitOnNewlines?: boolean },
): string[] => {
  const splitOnNewlines = options?.splitOnNewlines ?? false;
  const result: string[] = [];
  let current = "";
  let parenDepth = 0;
  let bracketDepth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escape = false;

  for (const char of selector) {
    if (escape) {
      current += char;
      escape = false;
      continue;
    }

    if (char === "\\") {
      current += char;
      escape = true;
      continue;
    }

    if (inSingleQuote) {
      current += char;
      if (char === "'") inSingleQuote = false;
      continue;
    }

    if (inDoubleQuote) {
      current += char;
      if (char === '"') inDoubleQuote = false;
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      current += char;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      current += char;
      continue;
    }

    if (char === "(") {
      parenDepth++;
      current += char;
      continue;
    }

    if (char === ")") {
      if (parenDepth > 0) parenDepth--;
      current += char;
      continue;
    }

    if (char === "[") {
      bracketDepth++;
      current += char;
      continue;
    }

    if (char === "]") {
      if (bracketDepth > 0) bracketDepth--;
      current += char;
      continue;
    }

    if (
      (char === "," || (splitOnNewlines && (char === "\n" || char === "\r"))) &&
      parenDepth === 0 &&
      bracketDepth === 0
    ) {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        result.push(trimmed);
      }
      current = "";
      continue;
    }

    current += char;
  }

  const trimmed = current.trim();
  if (trimmed.length > 0) {
    result.push(trimmed);
  }

  return result;
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
    return pos === "*" || target === pos || target.endsWith(`.${pos}`);
  });
};

export interface ParsedCosmeticPattern {
  selector: string;
  styleContent?: string;
}

export const parseCosmeticPattern = (
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

      const mm = extractMatchesMedia(parsed.selector);
      if (mm && mm.restSelector.length > 0) {
        const indentedDecls = decls
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n");
        cssBlocks.push(
          `@media ${mm.mediaQuery} {\n  ${mm.restSelector} {\n${indentedDecls}\n  }\n}`,
        );
      } else {
        cssBlocks.push(`${parsed.selector} {\n${decls}\n}`);
      }
    } else {
      const mm = extractMatchesMedia(parsed.selector);
      if (mm && mm.restSelector.length > 0) {
        cssBlocks.push(
          `@media ${mm.mediaQuery} {\n  ${mm.restSelector} {\n    display: none !important;\n  }\n}`,
        );
      } else {
        cssBlocks.push(`${parsed.selector} {\n  display: none !important;\n}`);
      }
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
        baseDecls: new Map<string, string>(),
        lightDecls: new Map<string, string>(),
        darkDecls: new Map<string, string>(),
      };
      selectorMap.set(selector, entry);
    }
    return entry;
  };

  processed.walkRules((rule) => {
    const rawSelectors = splitSelectorList(rule.selector);
    const normalizedSelector = rawSelectors
      .map((s) => normalizeSelector(s))
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
        entry.baseDecls.set(prop, val);
      }
    });
  });

  const cosmeticRules: string[] = [];
  const styleRules: string[] = [];
  let needsColorScheme = false;

  for (const entry of selectorMap.values()) {
    const allProps = new Set([
      ...entry.baseDecls.keys(),
      ...entry.lightDecls.keys(),
      ...entry.darkDecls.keys(),
    ]);

    if (allProps.size === 0) continue;

    const isPureHide =
      allProps.size === 1 &&
      allProps.has("display") &&
      cleanDeclValue(
        entry.baseDecls.get("display") ?? entry.lightDecls.get("display") ?? "",
      ).toLowerCase() === "none" &&
      (!entry.darkDecls.has("display") ||
        cleanDeclValue(entry.darkDecls.get("display") ?? "").toLowerCase() ===
          "none");

    if (isPureHide) {
      cosmeticRules.push(`${prefix}${entry.selector}`);
      continue;
    }

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
        styleRules.push(`${prefix}${sub}:style(${declPayload})`);
      }
    }

    if (lightFilterDecls.length > 0) {
      const declPayload = lightFilterDecls.join(" ");
      for (const sub of subSelectors) {
        styleRules.push(
          `${prefix}:matches-media((prefers-color-scheme: light)) ${sub}:style(${declPayload})`,
        );
      }
    }

    if (darkFilterDecls.length > 0) {
      const declPayload = darkFilterDecls.join(" ");
      for (const sub of subSelectors) {
        styleRules.push(
          `${prefix}:matches-media((prefers-color-scheme: dark)) ${sub}:style(${declPayload})`,
        );
      }
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
