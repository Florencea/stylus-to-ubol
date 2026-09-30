import {
  generate,
  parse,
  walk,
  type CssNode,
  type Declaration,
  type Selector,
} from "css-tree";
import { z } from "zod";

/* =========================================================================
   1. Data Contracts & Schemas
   ========================================================================= */

const StylusSectionSchema = z.object({
  code: z.string(),
  domains: z.array(z.string()).optional(),
});

const StylusStyleItemSchema = z.looseObject({
  sections: z.array(StylusSectionSchema),
});

const StylusSettingsItemSchema = z.object({
  settings: z.record(z.string(), z.unknown()),
});

const StylusExportSchema = z.union([
  z
    .tuple([StylusSettingsItemSchema])
    .rest(StylusStyleItemSchema)
    .transform(([, ...styles]) => styles),
  z.array(StylusStyleItemSchema),
  z
    .object({
      styles: z.array(StylusStyleItemSchema),
    })
    .transform((val) => val.styles),
  StylusStyleItemSchema.transform((val) => [val]),
]);

type StylusExport = z.infer<typeof StylusExportSchema>;

export interface StylusRule {
  domain: string;
  code: string;
}

export interface UbolConfig {
  customFilters: [string, string[]][];
  sandboxFilters: string[];
  [key: string]: unknown;
}

export interface ConversionStats {
  domainCount: number;
  hideRuleCount: number;
  styleRuleCount: number;
}

export interface ConversionResult {
  config: UbolConfig;
  stats: ConversionStats;
}

/* =========================================================================
   2. Stylus Rule Extraction
   ========================================================================= */

const loadStylusCSS = (styles: StylusExport): StylusRule[] => {
  const rules: StylusRule[] = [];
  for (const item of styles) {
    for (const { domains, code } of item.sections) {
      if (domains !== undefined && domains.length > 0) {
        for (const domain of domains) {
          rules.push({ domain, code });
        }
      } else {
        rules.push({ domain: "*", code });
      }
    }
  }
  return rules;
};

const parseStylusRules = (json: unknown): StylusRule[] => {
  return loadStylusCSS(StylusExportSchema.parse(json));
};

/* =========================================================================
   3. CSS AST Transformation & uBO Rule Synthesizer
   ========================================================================= */

export const serializeDeclaration = (declNode: Declaration): string => {
  const prop = declNode.property;
  const value = generate(declNode.value).trim();
  const isImportant = Boolean(declNode.important);
  return isImportant ? `${prop}:${value} !important` : `${prop}:${value}`;
};

export const splitSelectorAndPseudoElement = (
  selNode: Selector,
): { baseSelector: string; pseudoElement: string } => {
  const baseNodes: CssNode[] = [];
  let pseudoElement = "";

  for (const child of selNode.children) {
    if (
      child.type === "PseudoElementSelector" ||
      (child.type === "PseudoClassSelector" &&
        ["before", "after", "first-letter", "first-line"].includes(child.name))
    ) {
      pseudoElement = generate(child).trim();
    } else {
      baseNodes.push(child);
    }
  }

  const baseSelector = baseNodes
    .map((n) => generate(n))
    .join("")
    .trim();
  return { baseSelector, pseudoElement };
};

export const buildUboRules = (
  rules: StylusRule[],
  baseConfig?: Record<string, unknown> | null,
): UbolConfig => {
  const sandboxFilters: string[] = [];
  const customFiltersMap = new Map<string, string[]>();

  for (const { domain, code } of rules) {
    const ast = parse(code);
    const mediaStack: string[] = [];

    walk(ast, {
      enter: (node: CssNode) => {
        // 1. Maintain @media Stack
        if (
          node.type === "Atrule" &&
          node.name === "media" &&
          node.prelude !== null
        ) {
          const mediaQuery = generate(node.prelude).trim();
          mediaStack.push(mediaQuery);
          return;
        }

        // 2. Handle CSS Rule
        if (node.type === "Rule") {
          const declarations: string[] = [];

          walk(node.block, {
            visit: "Declaration",
            enter(decl) {
              declarations.push(serializeDeclaration(decl));
            },
          });

          if (declarations.length === 0) return;

          // Assemble :matches-media(...)
          const mediaSuffix =
            mediaStack.length > 0
              ? `:matches-media(${mediaStack.join(" and ")})`
              : "";

          // 3. Expand selectors and emit rules
          if (node.prelude.type === "SelectorList") {
            const selectorList = node.prelude;

            selectorList.children.forEach((selNode) => {
              if (selNode.type === "Selector") {
                const { baseSelector, pseudoElement } =
                  splitSelectorAndPseudoElement(selNode);
                const rawSelector = generate(selNode).trim();

                // Effective procedural selector (omit mediaSuffix if pseudo-element is present)
                const effectiveMediaSuffix =
                  pseudoElement !== "" ? "" : mediaSuffix;
                const proceduralSelector = `${baseSelector}${effectiveMediaSuffix}${pseudoElement}`;

                for (const declaration of declarations) {
                  if (
                    declaration === "display:none !important" &&
                    !mediaSuffix.includes("pointer:coarse")
                  ) {
                    let selectors = customFiltersMap.get(domain);
                    if (selectors === undefined) {
                      selectors = [];
                      customFiltersMap.set(domain, selectors);
                    }
                    selectors.push(rawSelector);
                  } else {
                    sandboxFilters.push(
                      `${domain}##${proceduralSelector}:style(${declaration})`,
                    );
                  }
                }
              }
            });
          }
        }
      },

      leave: (node: CssNode) => {
        if (node.type === "Atrule" && node.name === "media") {
          mediaStack.pop();
        }
      },
    });
  }

  const customFilters: [string, string[]][] = Array.from(customFiltersMap);

  if (baseConfig !== undefined && baseConfig !== null) {
    return {
      ...baseConfig,
      customFilters,
      sandboxFilters,
    };
  }

  return {
    version: "2026.920.1710",
    filteringModes: {
      none: [],
      basic: [],
      optimal: ["all-urls"],
      complete: [],
    },
    customFilters,
    sandboxFilters,
  };
};

/* =========================================================================
   4. Statistics & High-Level Compiler API
   ========================================================================= */

export const computeConfigStats = (config: UbolConfig): ConversionStats => {
  const domainSet = new Set<string>();
  let hideRuleCount = 0;

  for (const [domain, selectors] of config.customFilters) {
    const trimmed = domain.trim();
    if (trimmed.length > 0) {
      domainSet.add(trimmed);
    }
    hideRuleCount += selectors.length;
  }

  for (const rule of config.sandboxFilters) {
    const hashIdx = rule.indexOf("##");
    if (hashIdx !== -1) {
      const domainPart = rule.slice(0, hashIdx).trim();
      if (domainPart.length > 0) {
        for (const token of domainPart.split(",")) {
          const trimmed = token.trim();
          if (trimmed.length > 0) {
            domainSet.add(trimmed);
          }
        }
      }
    }
  }

  return {
    domainCount: domainSet.size,
    hideRuleCount,
    styleRuleCount: config.sandboxFilters.length,
  };
};

export const parseUbolBaseConfig = (
  rawBaseText: string,
): Record<string, unknown> => {
  const trimmed = rawBaseText.trim();
  if (trimmed.length === 0) {
    throw new Error("Uploaded uBlock config file is empty.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    throw new Error(
      `Failed to parse uBlock config JSON: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      "Invalid uBlock config JSON: Expected a JSON object configuration.",
    );
  }

  return parsed as Record<string, unknown>;
};

export const compileStylus = (
  rawText: string,
  baseConfigInput?: string | Record<string, unknown> | null,
): ConversionResult => {
  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    throw new Error("Uploaded file is empty.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    throw new Error(
      `Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  let rules: StylusRule[];
  try {
    rules = parseStylusRules(parsed);
  } catch (err) {
    throw new Error(
      `Invalid Stylus JSON: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  if (rules.length === 0) {
    throw new Error(
      "Invalid Stylus JSON: No styles or code sections found in the uploaded file.",
    );
  }

  let resolvedBaseConfig: Record<string, unknown> | null = null;
  if (typeof baseConfigInput === "string") {
    const baseTrimmed = baseConfigInput.trim();
    if (baseTrimmed.length > 0) {
      resolvedBaseConfig = parseUbolBaseConfig(baseTrimmed);
    }
  } else if (typeof baseConfigInput === "object" && baseConfigInput !== null) {
    if (Array.isArray(baseConfigInput)) {
      throw new Error(
        "Invalid uBlock config JSON: Expected a JSON object configuration.",
      );
    }
    resolvedBaseConfig = baseConfigInput;
  }

  const config = buildUboRules(rules, resolvedBaseConfig);
  const stats = computeConfigStats(config);

  return { config, stats };
};
