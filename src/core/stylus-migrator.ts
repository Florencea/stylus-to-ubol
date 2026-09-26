import * as csstree from "css-tree";
import { AstFilterParser } from "@gorhill/ubo-core/js/static-filtering-parser.js";
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

interface SelectorEntry {
  selector: string;
  lightMap: Map<string, string>;
  darkMap: Map<string, string>;
  mediaQueryMap: Map<string, Map<string, string>>;
}

interface CompiledRules {
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

export const normalizeSelector = (selector: string): string => {
  return selector
    .replace(
      /(?<!:):(before|after|first-letter|first-line|placeholder)\b/g,
      "::$1",
    )
    .trim();
};

const isEscaped = (str: string, index: number): boolean => {
  let backslashCount = 0;
  for (let i = index - 1; i >= 0 && str[i] === "\\"; i--) {
    backslashCount++;
  }
  return backslashCount % 2 === 1;
};

export const formatStyleDeclarations = (
  declarations:
    | [string, string][]
    | Map<string, string>
    | ReadonlyMap<string, string>
    | Iterable<[string, string]>,
): string => {
  const entries: [string, string][] = Array.isArray(declarations)
    ? declarations
    : declarations instanceof Map
      ? Array.from(declarations.entries())
      : Array.from(declarations);

  const formattedDecls: string[] = [];

  for (const [rawProp, rawVal] of entries) {
    const prop = rawProp.trim();
    if (prop.length === 0) {
      continue;
    }

    let cleanVal = rawVal.trim();
    while (
      cleanVal.endsWith(";") &&
      !isEscaped(cleanVal, cleanVal.length - 1)
    ) {
      cleanVal = cleanVal.slice(0, -1).trimEnd();
    }

    if (cleanVal.length === 0) {
      continue;
    }

    formattedDecls.push(`${prop}: ${cleanVal}`);
  }

  return formattedDecls.join("; ");
};

const resolveSelectors = (
  parentSelectors: string[] | undefined,
  childSelectors: string[],
): string[] => {
  if (!parentSelectors || parentSelectors.length === 0) {
    return childSelectors;
  }
  const result: string[] = [];
  for (const parent of parentSelectors) {
    for (const child of childSelectors) {
      if (child.includes("&")) {
        result.push(child.replaceAll("&", parent).trim());
      } else {
        result.push(`${parent} ${child}`.trim());
      }
    }
  }
  return result;
};

const COLOR_PROPERTIES = new Set([
  "box-shadow",
  "text-shadow",
  "fill",
  "stroke",
  "outline",
  "border",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-inline",
  "border-inline-start",
  "border-inline-end",
  "border-block",
  "border-block-start",
  "border-block-end",
  "column-rule",
  "text-decoration",
]);

const CSS_NAMED_COLORS = new Set([
  "aliceblue",
  "antiquewhite",
  "aqua",
  "aquamarine",
  "azure",
  "beige",
  "bisque",
  "black",
  "blanchedalmond",
  "blue",
  "blueviolet",
  "brown",
  "burlywood",
  "cadetblue",
  "chartreuse",
  "chocolate",
  "coral",
  "cornflowerblue",
  "cornsilk",
  "crimson",
  "cyan",
  "darkblue",
  "darkcyan",
  "darkgoldenrod",
  "darkgray",
  "darkgreen",
  "darkgrey",
  "darkkhaki",
  "darkmagenta",
  "darkolivegreen",
  "darkorange",
  "darkorchid",
  "darkred",
  "darksalmon",
  "darkseagreen",
  "darkslateblue",
  "darkslategray",
  "darkslategrey",
  "darkturquoise",
  "darkviolet",
  "deeppink",
  "deepskyblue",
  "dimgray",
  "dimgrey",
  "dodgerblue",
  "firebrick",
  "floralwhite",
  "forestgreen",
  "fuchsia",
  "gainsboro",
  "ghostwhite",
  "gold",
  "goldenrod",
  "gray",
  "green",
  "greenyellow",
  "grey",
  "honeydew",
  "hotpink",
  "indianred",
  "indigo",
  "ivory",
  "khaki",
  "lavender",
  "lavenderblush",
  "lawngreen",
  "lemonchiffon",
  "lightblue",
  "lightcoral",
  "lightcyan",
  "lightgoldenrodyellow",
  "lightgray",
  "lightgreen",
  "lightgrey",
  "lightpink",
  "lightsalmon",
  "lightseagreen",
  "lightskyblue",
  "lightslategray",
  "lightslategrey",
  "lightsteelblue",
  "lightyellow",
  "lime",
  "limegreen",
  "linen",
  "magenta",
  "maroon",
  "mediumaquamarine",
  "mediumblue",
  "mediumorchid",
  "mediumpurple",
  "mediumseagreen",
  "mediumslateblue",
  "mediumspringgreen",
  "mediumturquoise",
  "mediumvioletred",
  "midnightblue",
  "mintcream",
  "mistyrose",
  "moccasin",
  "navajowhite",
  "navy",
  "oldlace",
  "olive",
  "olivedrab",
  "orange",
  "orangered",
  "orchid",
  "palegoldenrod",
  "palegreen",
  "paleturquoise",
  "palevioletred",
  "papayawhip",
  "peachpuff",
  "peru",
  "pink",
  "plum",
  "powderblue",
  "purple",
  "rebeccapurple",
  "red",
  "rosybrown",
  "royalblue",
  "saddlebrown",
  "salmon",
  "sandybrown",
  "seagreen",
  "seashell",
  "sienna",
  "silver",
  "skyblue",
  "slateblue",
  "slategray",
  "slategrey",
  "snow",
  "springgreen",
  "steelblue",
  "tan",
  "teal",
  "thistle",
  "tomato",
  "turquoise",
  "violet",
  "wheat",
  "white",
  "whitesmoke",
  "yellow",
  "yellowgreen",
  "transparent",
  "currentcolor",
]);

const VAR_COLOR_KEYWORDS = ["color", "bg", "border", "fill", "stroke"];

const isColorValue = (val: string): boolean => {
  const cleanVal = val
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s*!important\s*$/i, "")
    .trim()
    .toLowerCase();
  if (!cleanVal) return false;
  if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(cleanVal)) {
    return true;
  }
  if (
    /^(?:rgba?|hsla?|color|oklch|oklab|hwb|lab|lch|light-dark)\s*\(/i.test(
      cleanVal,
    )
  ) {
    return true;
  }
  return CSS_NAMED_COLORS.has(cleanVal);
};

export const isColorProperty = (prop: string, value?: string): boolean => {
  const normalized = prop.trim().toLowerCase();
  if (normalized.startsWith("--")) {
    if (VAR_COLOR_KEYWORDS.some((kw) => normalized.includes(kw))) {
      return true;
    }
    if (value !== undefined) {
      return isColorValue(value);
    }
    return false;
  }
  const clean = normalized.replace(/^-(?:webkit|moz|ms|o)-/, "");
  if (clean.includes("color") || clean.includes("background")) {
    return true;
  }
  return COLOR_PROPERTIES.has(clean);
};

const compileSelectorMapToRules = (
  selectorMap: Map<string, SelectorEntry>,
  prefix: string,
): CompiledRules => {
  const cosmeticRules: string[] = [];
  const styleRules: string[] = [];
  let needsColorScheme = false;

  for (const entry of selectorMap.values()) {
    const { selector, lightMap, darkMap, mediaQueryMap } = entry;
    const allProps = new Set([...lightMap.keys(), ...darkMap.keys()]);
    if (allProps.size === 0 && mediaQueryMap.size === 0) continue;

    if (allProps.size > 0) {
      const isPureHide =
        allProps.size === 1 &&
        allProps.has("display") &&
        (lightMap.get("display") ?? "").toLowerCase() === "none" &&
        (!darkMap.has("display") ||
          (darkMap.get("display") ?? "").toLowerCase() === "none");

      if (isPureHide) {
        cosmeticRules.push(`${prefix}${selector}`);
      } else {
        const standardDecls: [string, string][] = [];
        const darkDecls: [string, string][] = [];

        for (const prop of allProps) {
          const lightVal = lightMap.get(prop);
          const darkVal = darkMap.get(prop);

          if (lightVal !== undefined && darkVal !== undefined) {
            if (lightVal === darkVal) {
              standardDecls.push([prop, `${lightVal} !important`]);
            } else if (
              isColorProperty(prop, lightVal) ||
              isColorProperty(prop, darkVal)
            ) {
              standardDecls.push([
                prop,
                `light-dark(${lightVal}, ${darkVal}) !important`,
              ]);
              needsColorScheme = true;
            } else {
              standardDecls.push([prop, `${lightVal} !important`]);
              darkDecls.push([prop, `${darkVal} !important`]);
            }
          } else if (lightVal !== undefined) {
            standardDecls.push([prop, `${lightVal} !important`]);
          } else if (darkVal !== undefined) {
            darkDecls.push([prop, `${darkVal} !important`]);
          }
        }

        const formattedStandard = formatStyleDeclarations(standardDecls);
        if (formattedStandard.length > 0) {
          styleRules.push(`${prefix}${selector}:style(${formattedStandard})`);
        }

        const formattedDark = formatStyleDeclarations(darkDecls);
        if (formattedDark.length > 0) {
          styleRules.push(
            `${prefix}${selector}:matches-media((prefers-color-scheme: dark)):style(${formattedDark})`,
          );
        }
      }
    }

    if (mediaQueryMap.size > 0) {
      for (const [queryCondition, declMap] of mediaQueryMap.entries()) {
        const decls: [string, string][] = [];
        for (const [prop, val] of declMap.entries()) {
          decls.push([prop, `${val} !important`]);
        }
        const formattedMedia = formatStyleDeclarations(decls);
        if (formattedMedia.length > 0) {
          styleRules.push(
            `${prefix}${selector}:matches-media(${queryCondition}):style(${formattedMedia})`,
          );
        }
      }
    }
  }

  if (needsColorScheme) {
    let hasColorSchemeSet = false;
    for (let i = 0; i < styleRules.length; i++) {
      const rule = styleRules[i];
      if (
        rule &&
        (rule.includes("##:root:style(") || rule.includes("##html:style("))
      ) {
        if (!rule.includes("color-scheme:")) {
          const styleMatch = /:style\(([\s\S]*)\)$/.exec(rule);
          if (styleMatch) {
            const existingContent = styleMatch[1]?.trim() ?? "";
            const newContent =
              existingContent.length > 0
                ? `color-scheme: light dark !important; ${existingContent}`
                : "color-scheme: light dark !important";
            styleRules[i] = rule.replace(
              /:style\([\s\S]*\)$/,
              `:style(${newContent})`,
            );
          }
        }
        hasColorSchemeSet = true;
        break;
      }
    }

    if (!hasColorSchemeSet) {
      styleRules.unshift(
        `${prefix}:root:style(${formatStyleDeclarations([["color-scheme", "light dark !important"]])})`,
      );
    }
  }

  return { cosmeticRules, styleRules };
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

interface CssTreeParserContext {
  tokenStart: number;
  tokenType: number;
  tokenIndex: number;
  eof: boolean;
  createList: () => csstree.List<csstree.CssNode>;
  eat: (tokenType: number) => void;
  next: () => void;
  lookupType: (offset: number) => number;
  getLocation: (start: number, end: number) => csstree.CssLocation | undefined;
  parseWithFallback: (
    consumer: () => csstree.CssNode,
    fallback: () => csstree.CssNode,
  ) => csstree.CssNode;
  Atrule: (isStyleBlock: boolean) => csstree.CssNode;
  Rule: () => csstree.CssNode;
  Declaration: () => csstree.CssNode;
  Raw: (consumer: unknown, isRaw: boolean) => csstree.CssNode;
  consumeUntilSemicolonIncluded: unknown;
}

const isRuleAhead = (parser: CssTreeParserContext): boolean => {
  let parenDepth = 0;
  let bracketDepth = 0;
  for (let offset = 0; offset <= 5000; offset++) {
    const type = parser.lookupType(offset);
    if (
      type === 0 ||
      type === csstree.tokenTypes.EOF ||
      type === csstree.tokenTypes.RightCurlyBracket
    ) {
      return false;
    }
    if (type === csstree.tokenTypes.LeftParenthesis) {
      parenDepth++;
    } else if (type === csstree.tokenTypes.RightParenthesis) {
      if (parenDepth > 0) parenDepth--;
    } else if (type === csstree.tokenTypes.LeftSquareBracket) {
      bracketDepth++;
    } else if (type === csstree.tokenTypes.RightSquareBracket) {
      if (bracketDepth > 0) bracketDepth--;
    } else if (parenDepth === 0 && bracketDepth === 0) {
      if (type === csstree.tokenTypes.Semicolon) {
        return false;
      }
      if (type === csstree.tokenTypes.LeftCurlyBracket) {
        return true;
      }
    }
  }
  return false;
};

const customTree = csstree.fork({
  node: {
    Block: {
      parse(
        this: CssTreeParserContext,
        isStyleBlock: boolean,
      ): csstree.CssNode {
        const {
          LeftCurlyBracket,
          RightCurlyBracket,
          WhiteSpace,
          Comment,
          AtKeyword,
          Semicolon,
        } = csstree.tokenTypes;

        const start = this.tokenStart;
        const children = this.createList();

        this.eat(LeftCurlyBracket);

        scan: while (!this.eof) {
          switch (this.tokenType) {
            case RightCurlyBracket:
              break scan;

            case WhiteSpace:
            case Comment:
              this.next();
              break;

            case AtKeyword:
              children.push(
                this.parseWithFallback(
                  () => this.Atrule(isStyleBlock),
                  () => this.Raw(null, true),
                ),
              );
              break;

            default:
              if (isStyleBlock) {
                if (isRuleAhead(this)) {
                  children.push(
                    this.parseWithFallback(
                      () => this.Rule(),
                      () => this.Raw(null, true),
                    ),
                  );
                } else {
                  if (this.tokenType === Semicolon) {
                    children.push(
                      this.Raw(this.consumeUntilSemicolonIncluded, true),
                    );
                  } else {
                    const node = this.parseWithFallback(
                      () => this.Declaration(),
                      () => this.Raw(this.consumeUntilSemicolonIncluded, true),
                    );
                    if (this.tokenType === Semicolon) {
                      this.next();
                    }
                    children.push(node);
                  }
                }
              } else {
                children.push(
                  this.parseWithFallback(
                    () => this.Rule(),
                    () => this.Raw(null, true),
                  ),
                );
              }
          }
        }

        if (!this.eof) {
          this.eat(RightCurlyBracket);
        }

        return {
          type: "Block",
          loc: this.getLocation(start, this.tokenStart),
          children,
        };
      },
    },
  },
});

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

  if (css.trim().length === 0) {
    return {
      cosmeticRules: [],
      styleRules: [],
      scopedCosmeticRules: { global: [], desktop: [], mobile: [] },
      scopedStyleRules: { global: [], desktop: [], mobile: [] },
    };
  }

  const ast = customTree.parse(css, {
    positions: true,
    parseAtrulePrelude: true,
    parseRulePrelude: true,
  });

  const scopeMap = new Map<RuleScope, Map<string, SelectorEntry>>([
    ["global", new Map<string, SelectorEntry>()],
    ["desktop", new Map<string, SelectorEntry>()],
    ["mobile", new Map<string, SelectorEntry>()],
  ]);

  const getOrCreateEntry = (
    selector: string,
    scope: RuleScope,
  ): SelectorEntry => {
    let map = scopeMap.get(scope);
    if (!map) {
      map = new Map<string, SelectorEntry>();
      scopeMap.set(scope, map);
    }
    let entry = map.get(selector);
    if (!entry) {
      entry = {
        selector,
        lightMap: new Map<string, string>(),
        darkMap: new Map<string, string>(),
        mediaQueryMap: new Map<string, Map<string, string>>(),
      };
      map.set(selector, entry);
    }
    return entry;
  };

  const selectorStack: string[][] = [];
  const mediaStack: {
    isDark: boolean;
    isLight: boolean;
    scope: RuleScope | null;
    raw: string;
    genericCondition: string | null;
  }[] = [];

  customTree.walk(ast, {
    enter(node: csstree.CssNode) {
      if (node.type === "Atrule") {
        if (node.name === "media") {
          const rawPrelude = node.prelude?.loc
            ? css.slice(
                node.prelude.loc.start.offset,
                node.prelude.loc.end.offset,
              )
            : node.prelude
              ? customTree.generate(node.prelude)
              : "";
          let cleanPrelude = rawPrelude
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .trim()
            .replace(/\s+/g, " ");

          if (!node.prelude?.loc) {
            cleanPrelude = cleanPrelude.replace(/:\s*([^\s)])/g, ": $1");
          }

          const preludeStr = cleanPrelude.toLowerCase();
          const isDark = /prefers-color-scheme\s*:\s*dark/.test(preludeStr);
          const isLight = /prefers-color-scheme\s*:\s*light/.test(preludeStr);
          const pointerCoarse = /pointer\s*:\s*coarse/.test(preludeStr);
          const pointerFine = /pointer\s*:\s*fine/.test(preludeStr);
          const notPointerCoarse = /not\s+.*pointer\s*:\s*coarse/.test(
            preludeStr,
          );

          let scope: RuleScope | null = null;
          if (pointerCoarse) {
            scope = notPointerCoarse ? "desktop" : "mobile";
          } else if (pointerFine) {
            scope = "desktop";
          }

          let genericCondition: string | null = null;
          if (!isDark && !isLight) {
            const isPurePointer =
              (pointerCoarse || pointerFine) &&
              !preludeStr.includes("max-") &&
              !preludeStr.includes("min-") &&
              !preludeStr.includes("width") &&
              !preludeStr.includes("height");
            if (!isPurePointer && cleanPrelude.length > 0) {
              genericCondition = cleanPrelude;
            }
          }

          mediaStack.push({
            isDark,
            isLight,
            scope,
            raw: preludeStr,
            genericCondition,
          });
        } else {
          return csstree.walk.skip;
        }
      } else if (node.type === "Rule") {
        const rawSelectors: string[] = [];
        if (node.prelude.type === "SelectorList") {
          node.prelude.children.forEach((child: csstree.CssNode) => {
            const raw = child.loc
              ? css.slice(child.loc.start.offset, child.loc.end.offset)
              : customTree.generate(child);
            const str = raw
              .replace(/\/\*[\s\S]*?\*\//g, "")
              .trim()
              .replace(/\s+/g, " ");
            if (str.length > 0) {
              rawSelectors.push(str);
            }
          });
        } else {
          const raw = node.prelude.loc
            ? css.slice(
                node.prelude.loc.start.offset,
                node.prelude.loc.end.offset,
              )
            : customTree.generate(node.prelude);
          const str = raw
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .trim()
            .replace(/\s+/g, " ");
          if (str.length > 0) {
            rawSelectors.push(str);
          }
        }

        const parentSels = selectorStack[selectorStack.length - 1];
        const resolved = resolveSelectors(parentSels, rawSelectors)
          .map(normalizeSelector)
          .filter((s) => s.length > 0);
        selectorStack.push(resolved);
      } else if (node.type === "Declaration") {
        const currentSels = selectorStack[selectorStack.length - 1];
        if (!currentSels || currentSels.length === 0) return;

        const genericConditions = mediaStack
          .map((m) => m.genericCondition)
          .filter((c): c is string => Boolean(c));

        const activeScope =
          [...mediaStack].reverse().find((m) => m.scope !== null)?.scope ??
          defaultScope;

        const prop = node.property.trim();
        const rawVal = node.value.loc
          ? css.slice(node.value.loc.start.offset, node.value.loc.end.offset)
          : customTree.generate(node.value);
        const val = rawVal
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/\s*!important\s*$/i, "")
          .trim();
        if (prop.length === 0 || val.length === 0) return;

        for (const sel of currentSels) {
          const entry = getOrCreateEntry(sel, activeScope);
          if (genericConditions.length > 0) {
            let condition = genericConditions.join(" and ");
            if (mediaStack.some((m) => m.isDark)) {
              condition = `${condition} and (prefers-color-scheme: dark)`;
            }
            let declMap = entry.mediaQueryMap.get(condition);
            if (!declMap) {
              declMap = new Map<string, string>();
              entry.mediaQueryMap.set(condition, declMap);
            }
            declMap.set(prop, val);
          } else {
            const isDark = mediaStack.some((m) => m.isDark);
            if (isDark) {
              entry.darkMap.set(prop, val);
            } else {
              entry.lightMap.set(prop, val);
            }
          }
        }
      }
    },
    leave(node: csstree.CssNode) {
      if (node.type === "Atrule" && node.name === "media") {
        mediaStack.pop();
      } else if (node.type === "Rule") {
        selectorStack.pop();
      }
    },
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

    const { cosmeticRules: cRules, styleRules: sRules } =
      compileSelectorMapToRules(selectorMap, prefix);
    scopedCosmeticRules[scope] = cRules;
    scopedStyleRules[scope] = sRules;
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
