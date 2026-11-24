import generate from "css-tree/generator";
import parse from "css-tree/parser";
import walk from "css-tree/walker";
import { z } from "zod";

/* =========================================================================
   1. Data Contracts & Schemas
   ========================================================================= */

export const StylusSectionSchema = z.object({
  code: z.string(),
  domains: z.array(z.string()).optional(),
});

export const StylusStyleItemSchema = z.looseObject({
  sections: z.array(StylusSectionSchema),
});

export const StylusSettingsItemSchema = z.object({
  settings: z.record(z.string(), z.unknown()),
});

export const StylusExportSchema = z.union([
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

export const StylusRuleSchema = z.object({
  domain: z.string(),
  code: z.string(),
});

export const StylusRulesSchema = z.array(StylusRuleSchema);

export const BaseConfigObjectSchema = z.record(z.string(), z.unknown());

export const UbolConfigSchema = z.looseObject({
  customFilters: z.array(z.tuple([z.string(), z.array(z.string())])),
  sandboxFilters: z.array(z.string()),
});

const CssDeclarationNodeSchema = z.looseObject({
  type: z.literal("Declaration"),
  property: z.string(),
  value: z.looseObject({ type: z.string() }),
  important: z.union([z.boolean(), z.string()]),
});

const CssSelectorNodeSchema = z.looseObject({
  type: z.literal("Selector"),
  children: z.custom(
    (val) =>
      val !== null &&
      typeof val === "object" &&
      Symbol.iterator in val &&
      typeof val[Symbol.iterator] === "function",
    { message: "Expected an iterable Selector children list." },
  ),
});

const RawTextSchema = z.string();

const PSEUDO_ELEMENT_LEGACY_NAMES = new Set([
  "before",
  "after",
  "first-letter",
  "first-line",
]);

/* =========================================================================
   2. Stylus Rule Extraction
   ========================================================================= */

const loadStylusCSS = (styles) => {
  const rules = [];
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

const parseStylusRules = (json) => {
  return loadStylusCSS(StylusExportSchema.parse(json));
};

/* =========================================================================
   3. CSS AST Transformation & uBO Rule Synthesizer
   ========================================================================= */

const serializeDeclarationInternal = (declNode) => {
  const prop = declNode.property;
  const value = generate(declNode.value).trim();
  const isImportant = Boolean(declNode.important);
  return isImportant ? `${prop}:${value} !important` : `${prop}:${value}`;
};

export const serializeDeclaration = (declNode) => {
  const validated = CssDeclarationNodeSchema.parse(declNode);
  return serializeDeclarationInternal(validated);
};

const splitSelectorAndPseudoElementInternal = (selNode) => {
  const baseNodes = [];
  let pseudoElement = "";

  for (const child of selNode.children) {
    if (
      child.type === "PseudoElementSelector" ||
      (child.type === "PseudoClassSelector" &&
        PSEUDO_ELEMENT_LEGACY_NAMES.has(child.name))
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

export const splitSelectorAndPseudoElement = (selNode) => {
  const validated = CssSelectorNodeSchema.parse(selNode);
  return splitSelectorAndPseudoElementInternal(validated);
};

export const buildUboRules = (rules, baseConfig) => {
  const validatedRules = StylusRulesSchema.parse(rules);
  const validatedBaseConfig =
    baseConfig !== undefined && baseConfig !== null
      ? BaseConfigObjectSchema.parse(baseConfig)
      : null;

  const sandboxFilters = [];
  const customFiltersMap = new Map();

  for (const { domain, code } of validatedRules) {
    const ast = parse(code);
    const mediaStack = [];

    walk(ast, {
      enter: (node) => {
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
          const declarations = [];

          walk(node.block, {
            visit: "Declaration",
            enter(decl) {
              declarations.push(serializeDeclarationInternal(decl));
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
                  splitSelectorAndPseudoElementInternal(selNode);
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

      leave: (node) => {
        if (node.type === "Atrule" && node.name === "media") {
          mediaStack.pop();
        }
      },
    });
  }

  const customFilters = Array.from(customFiltersMap);

  if (validatedBaseConfig !== null) {
    return {
      ...validatedBaseConfig,
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

export const computeConfigStats = (config) => {
  const validatedConfig = UbolConfigSchema.parse(config);
  const domainSet = new Set();
  let hideRuleCount = 0;

  for (const [domain, selectors] of validatedConfig.customFilters) {
    const trimmed = domain.trim();
    if (trimmed.length > 0) {
      domainSet.add(trimmed);
    }
    hideRuleCount += selectors.length;
  }

  for (const rule of validatedConfig.sandboxFilters) {
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
    styleRuleCount: validatedConfig.sandboxFilters.length,
  };
};

export const parseUbolBaseConfig = (rawBaseText) => {
  const validatedText = RawTextSchema.parse(rawBaseText);
  const trimmed = validatedText.trim();
  if (trimmed.length === 0) {
    throw new Error("Uploaded uBlock config file is empty.");
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    throw new Error(
      `Failed to parse uBlock config JSON: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  const parseResult = BaseConfigObjectSchema.safeParse(parsed);
  if (!parseResult.success) {
    throw new Error(
      "Invalid uBlock config JSON: Expected a JSON object configuration.",
    );
  }

  return parseResult.data;
};

export const compileStylus = (rawText, baseConfigInput) => {
  const validatedText = RawTextSchema.parse(rawText);
  const trimmed = validatedText.trim();
  if (trimmed.length === 0) {
    throw new Error("Uploaded file is empty.");
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    throw new Error(
      `Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`,
      {
        cause: err,
      },
    );
  }

  let rules;
  try {
    rules = parseStylusRules(parsed);
  } catch (err) {
    throw new Error(
      `Invalid Stylus JSON: ${err instanceof Error ? err.message : String(err)}`,
      {
        cause: err,
      },
    );
  }

  if (rules.length === 0) {
    throw new Error(
      "Invalid Stylus JSON: No styles or code sections found in the uploaded file.",
    );
  }

  let resolvedBaseConfig = null;
  if (typeof baseConfigInput === "string") {
    const baseTrimmed = baseConfigInput.trim();
    if (baseTrimmed.length > 0) {
      resolvedBaseConfig = parseUbolBaseConfig(baseTrimmed);
    }
  } else if (baseConfigInput !== undefined && baseConfigInput !== null) {
    const baseResult = BaseConfigObjectSchema.safeParse(baseConfigInput);
    if (!baseResult.success) {
      throw new Error(
        "Invalid uBlock config JSON: Expected a JSON object configuration.",
      );
    }
    resolvedBaseConfig = baseResult.data;
  }

  const config = buildUboRules(rules, resolvedBaseConfig);
  const stats = computeConfigStats(config);

  return { config, stats };
};
