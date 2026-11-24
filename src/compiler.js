import { CssParseError, MAX_CSS_ERRORS, parseCss } from "./css-parser.js";
import {
  parseBaseConfigObject,
  parseCssDeclarationNode,
  parseCssSelectorNode,
  parseRawText,
  parseStylusExport,
  parseStylusRules,
  parseUbolConfig,
  safeParseBaseConfigObject,
  ValidationError,
} from "./validate.js";

export { CssParseError, ValidationError };

/* =========================================================================
   1. Stylus Rule Extraction
   ========================================================================= */

const loadStylusCSS = (styles) => {
  const rules = [];
  for (let styleIdx = 0; styleIdx < styles.length; styleIdx += 1) {
    const item = styles[styleIdx];
    const styleName =
      typeof item.name === "string" && item.name.trim().length > 0
        ? item.name.trim()
        : undefined;

    for (let secIdx = 0; secIdx < item.sections.length; secIdx += 1) {
      const { domains, code } = item.sections[secIdx];
      const sectionIndex = secIdx + 1;
      const meta =
        styleName !== undefined
          ? { styleName, sectionIndex }
          : { sectionIndex };

      if (domains !== undefined && domains.length > 0) {
        for (const domain of domains) {
          rules.push({ domain, code, ...meta });
        }
      } else {
        rules.push({ domain: "*", code, ...meta });
      }
    }
  }
  return rules;
};

const parseStylusRulesFromJson = (json) => {
  return loadStylusCSS(parseStylusExport(json));
};

/* =========================================================================
   2. CSS AST Transformation & uBO Rule Synthesizer
   ========================================================================= */

const serializeDeclarationInternal = (declNode) => {
  const prop = declNode.property;
  const value = declNode.value.trim();
  return declNode.important
    ? `${prop}:${value} !important`
    : `${prop}:${value}`;
};

export const serializeDeclaration = (declNode) => {
  const validated = parseCssDeclarationNode(declNode);
  return serializeDeclarationInternal(validated);
};

const splitSelectorAndPseudoElementInternal = (selNode) => {
  return {
    baseSelector: selNode.baseSelector,
    pseudoElement: selNode.pseudoElement,
  };
};

export const splitSelectorAndPseudoElement = (selNode) => {
  const validated = parseCssSelectorNode(selNode);
  return splitSelectorAndPseudoElementInternal(validated);
};

const emitNodes = (
  nodes,
  domain,
  mediaStack,
  customFiltersMap,
  sandboxFilters,
) => {
  for (const node of nodes) {
    if (node.type === "MediaRule") {
      mediaStack.push(node.prelude);
      emitNodes(
        node.body,
        domain,
        mediaStack,
        customFiltersMap,
        sandboxFilters,
      );
      mediaStack.pop();
      continue;
    }

    if (node.type === "Rule") {
      if (node.declarations.length === 0) continue;

      const declarations = node.declarations.map(serializeDeclarationInternal);
      const mediaSuffix =
        mediaStack.length > 0
          ? `:matches-media(${mediaStack.join(" and ")})`
          : "";

      for (const selNode of node.selectors) {
        const { baseSelector, pseudoElement } =
          splitSelectorAndPseudoElementInternal(selNode);
        const rawSelector = selNode.raw;

        const effectiveMediaSuffix = pseudoElement !== "" ? "" : mediaSuffix;
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
    }
  }
};

export const buildUboRules = (rules, baseConfig) => {
  const validatedRules = parseStylusRules(rules);
  const validatedBaseConfig =
    baseConfig !== undefined && baseConfig !== null
      ? parseBaseConfigObject(baseConfig)
      : null;

  const sandboxFilters = [];
  const customFiltersMap = new Map();
  const collectedIssues = [];
  const seenIssueKeys = new Set();
  let totalIssueCount = 0;

  for (const rule of validatedRules) {
    const { domain, code, styleName, sectionIndex } = rule;
    let ast;
    try {
      ast = parseCss(code, { domain, styleName, sectionIndex });
    } catch (err) {
      if (err instanceof CssParseError) {
        for (const issue of err.issues) {
          const dedupeKey = `${issue.styleName ?? ""}|${issue.sectionIndex ?? ""}|${issue.line}|${issue.column}|${issue.message}`;
          if (seenIssueKeys.has(dedupeKey)) continue;
          seenIssueKeys.add(dedupeKey);
          totalIssueCount += 1;
          if (collectedIssues.length < MAX_CSS_ERRORS) {
            collectedIssues.push(issue);
          }
        }
        continue;
      }
      throw err;
    }

    if (collectedIssues.length === 0) {
      emitNodes(ast.body, domain, [], customFiltersMap, sandboxFilters);
    }
  }

  if (collectedIssues.length > 0) {
    throw new CssParseError(collectedIssues, totalIssueCount);
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
   3. Statistics & High-Level Compiler API
   ========================================================================= */

export const computeConfigStats = (config) => {
  const validatedConfig = parseUbolConfig(config);
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
  const validatedText = parseRawText(rawBaseText);
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

  const parseResult = safeParseBaseConfigObject(parsed);
  if (!parseResult.success) {
    throw new Error(
      "Invalid uBlock config JSON: Expected a JSON object configuration.",
    );
  }

  return parseResult.data;
};

export const compileStylus = (rawText, baseConfigInput) => {
  const validatedText = parseRawText(rawText);
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
    rules = parseStylusRulesFromJson(parsed);
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
    const baseResult = safeParseBaseConfigObject(baseConfigInput);
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
