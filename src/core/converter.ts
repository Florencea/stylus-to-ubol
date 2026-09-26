import { AstFilterParser } from "@gorhill/ubo-core/js/static-filtering-parser.js";
import { normalizeSelector, parseStylusSection } from "./stylus-migrator.ts";

export { normalizeSelector };

export const extractMatchesMedia = (
  selector: string,
): { mediaQuery: string; restSelector: string } | null => {
  const match = /^:matches-media\(/.exec(selector);
  if (!match) return null;

  const startIdx = match[0].length - 1;
  let depth = 0;
  let closeIdx = -1;

  for (let i = startIdx; i < selector.length; i++) {
    const char = selector[i];
    if (char === "(") {
      depth++;
    } else if (char === ")") {
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

export const compileCssToUbolRules = (
  css: string,
  domain: string,
): string[] => {
  if (css.trim().length === 0) return [];

  const domains = domain.trim().length > 0 ? [domain.trim()] : undefined;
  const result = parseStylusSection(css, domains);
  let allRules = [...result.cosmeticRules, ...result.styleRules];

  if (domain.trim().length === 0) {
    allRules = allRules.map((r) => (r.startsWith("*##") ? r.slice(1) : r));
  }

  const uboParser = new AstFilterParser();
  for (const rule of allRules) {
    uboParser.parse(rule);
    if (uboParser.hasError() || !uboParser.isCosmeticFilter()) {
      throw new Error(`Compiled uBO rule failed syntax validation: ${rule}`);
    }
  }

  return allRules;
};
