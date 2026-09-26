import { isColorProperty } from "./color-detector.ts";
import { formatStyleDeclarations } from "./formatter.ts";
import type { CompiledRules, SelectorEntry } from "./types.ts";

const injectColorScheme = (styleRules: string[], prefix: string): void => {
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
};

export const compileSelectorMapToRules = (
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
    injectColorScheme(styleRules, prefix);
  }

  return { cosmeticRules, styleRules };
};
