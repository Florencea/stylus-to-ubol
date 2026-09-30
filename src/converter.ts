import {
  parse,
  walk,
  generate,
  type CssNode,
  type Declaration,
  type Selector,
} from "css-tree";
import {
  UbolConfigSchema,
  type StylusRule,
  type UbolConfig,
} from "./schema.ts";

export const serializeDeclaration = (declNode: Declaration): string => {
  const prop = declNode.property;
  // Convert pure AST node value to text (excluding !important)
  const value = generate(declNode.value).trim();

  // declNode.important can be boolean or string (e.g. "important")
  const isImportant = Boolean(declNode.important);

  return isImportant ? `${prop}:${value} !important` : `${prop}:${value}`;
};

/**
 * Split a Selector node into base selector and ending pseudo-element
 * Ensures uBo procedural operators (such as :matches-media) are placed before pseudo-elements
 */
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

export const buildUboRules = (rules: StylusRule[]): UbolConfig => {
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

          // Walk declarations within this rule block
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

                // Raw selector for pure cosmetic hide rules in customFilters
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
                    const oldSelectors = customFiltersMap.get(domain);
                    if (oldSelectors !== undefined) {
                      customFiltersMap.set(domain, [
                        ...oldSelectors,
                        rawSelector,
                      ]);
                    } else {
                      customFiltersMap.set(domain, [rawSelector]);
                    }
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

  return UbolConfigSchema.parse({
    version: "2026.920.1710",
    filteringModes: {
      none: [],
      basic: [],
      optimal: ["all-urls"],
      complete: [],
    },
    customFilters: Array.from(customFiltersMap),
    sandboxFilters,
  });
};
