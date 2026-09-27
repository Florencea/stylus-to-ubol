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
    const { selector, baseMap, lightMap, darkMap, mediaQueryMap } = entry;
    const allProps = new Set([
      ...baseMap.keys(),
      ...lightMap.keys(),
      ...darkMap.keys(),
    ]);
    if (allProps.size === 0 && mediaQueryMap.size === 0) continue;

    if (allProps.size > 0) {
      const isPureHide =
        allProps.size === 1 &&
        allProps.has("display") &&
        ((baseMap.get("display")?.toLowerCase() === "none" &&
          (!lightMap.has("display") ||
            lightMap.get("display")?.toLowerCase() === "none") &&
          (!darkMap.has("display") ||
            darkMap.get("display")?.toLowerCase() === "none")) ||
          (baseMap.size === 0 &&
            lightMap.get("display")?.toLowerCase() === "none" &&
            darkMap.get("display")?.toLowerCase() === "none"));

      if (isPureHide) {
        cosmeticRules.push(`${prefix}${selector}`);
      } else {
        const standardDecls: [string, string][] = [];
        const lightDecls: [string, string][] = [];
        const darkDecls: [string, string][] = [];

        for (const prop of allProps) {
          const baseVal = baseMap.get(prop);
          const lightVal = lightMap.get(prop);
          const darkVal = darkMap.get(prop);

          if (
            baseVal !== undefined &&
            lightVal === undefined &&
            darkVal === undefined
          ) {
            standardDecls.push([prop, `${baseVal} !important`]);
          } else if (
            lightVal !== undefined &&
            baseVal === undefined &&
            darkVal === undefined
          ) {
            lightDecls.push([prop, `${lightVal} !important`]);
          } else if (
            darkVal !== undefined &&
            baseVal === undefined &&
            lightVal === undefined
          ) {
            darkDecls.push([prop, `${darkVal} !important`]);
          } else {
            const effectiveLight = lightVal ?? baseVal;
            const effectiveDark = darkVal ?? baseVal;

            if (effectiveLight !== undefined && effectiveDark !== undefined) {
              if (effectiveLight === effectiveDark) {
                standardDecls.push([prop, `${effectiveLight} !important`]);
              } else if (
                isColorProperty(prop, effectiveLight) ||
                isColorProperty(prop, effectiveDark)
              ) {
                standardDecls.push([
                  prop,
                  `light-dark(${effectiveLight}, ${effectiveDark}) !important`,
                ]);
                needsColorScheme = true;
              } else {
                if (baseVal !== undefined) {
                  standardDecls.push([prop, `${baseVal} !important`]);
                  if (lightVal !== undefined && lightVal !== baseVal) {
                    lightDecls.push([prop, `${lightVal} !important`]);
                  }
                  if (darkVal !== undefined && darkVal !== baseVal) {
                    darkDecls.push([prop, `${darkVal} !important`]);
                  }
                } else {
                  if (lightVal !== undefined) {
                    lightDecls.push([prop, `${lightVal} !important`]);
                  }
                  if (darkVal !== undefined) {
                    darkDecls.push([prop, `${darkVal} !important`]);
                  }
                }
              }
            }
          }
        }

        const formattedStandard = formatStyleDeclarations(standardDecls);
        if (formattedStandard.length > 0) {
          styleRules.push(`${prefix}${selector}:style(${formattedStandard})`);
        }

        const formattedLight = formatStyleDeclarations(lightDecls);
        if (formattedLight.length > 0) {
          styleRules.push(
            `${prefix}${selector}:matches-media((prefers-color-scheme: light)):style(${formattedLight})`,
          );
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
