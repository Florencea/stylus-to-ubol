import * as csstree from "css-tree";
import type { RuleScope, ScopeMap, SelectorEntry } from "./types.ts";

export const normalizeSelector = (selector: string): string => {
  return selector
    .replace(
      /(?<!:):(before|after|first-letter|first-line|placeholder)\b/g,
      "::$1",
    )
    .trim();
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

export const walkStylusCss = (
  css: string,
  defaultScope: RuleScope = "global",
): ScopeMap => {
  const ast = customTree.parse(css, {
    positions: true,
    parseAtrulePrelude: true,
    parseRulePrelude: true,
  });

  const scopeMap: ScopeMap = new Map<RuleScope, Map<string, SelectorEntry>>([
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

  return scopeMap;
};
