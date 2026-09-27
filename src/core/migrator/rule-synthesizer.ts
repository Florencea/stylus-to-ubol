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

const formatDeclValue = (value: string, important: boolean): string =>
  important ? `${value} !important` : value;

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
        ((baseMap.get("display")?.value.toLowerCase() === "none" &&
          (!lightMap.has("display") ||
            lightMap.get("display")?.value.toLowerCase() === "none") &&
          (!darkMap.has("display") ||
            darkMap.get("display")?.value.toLowerCase() === "none")) ||
          (baseMap.size === 0 &&
            lightMap.get("display")?.value.toLowerCase() === "none" &&
            darkMap.get("display")?.value.toLowerCase() === "none"));

      if (isPureHide) {
        cosmeticRules.push(`${prefix}${selector}`);
      } else {
        const standardDecls: [string, string][] = [];
        const lightDecls: [string, string][] = [];
        const darkDecls: [string, string][] = [];

        for (const prop of allProps) {
          const baseDecl = baseMap.get(prop);
          const lightDecl = lightMap.get(prop);
          const darkDecl = darkMap.get(prop);

          if (
            baseDecl !== undefined &&
            lightDecl === undefined &&
            darkDecl === undefined
          ) {
            standardDecls.push([
              prop,
              formatDeclValue(baseDecl.value, baseDecl.important),
            ]);
          } else if (
            lightDecl !== undefined &&
            baseDecl === undefined &&
            darkDecl === undefined
          ) {
            lightDecls.push([
              prop,
              formatDeclValue(lightDecl.value, lightDecl.important),
            ]);
          } else if (
            darkDecl !== undefined &&
            baseDecl === undefined &&
            lightDecl === undefined
          ) {
            darkDecls.push([
              prop,
              formatDeclValue(darkDecl.value, darkDecl.important),
            ]);
          } else {
            const effectiveLight = lightDecl ?? baseDecl;
            const effectiveDark = darkDecl ?? baseDecl;

            if (effectiveLight !== undefined && effectiveDark !== undefined) {
              if (
                effectiveLight.value === effectiveDark.value &&
                effectiveLight.important === effectiveDark.important
              ) {
                standardDecls.push([
                  prop,
                  formatDeclValue(
                    effectiveLight.value,
                    effectiveLight.important,
                  ),
                ]);
              } else if (
                isColorProperty(prop, effectiveLight.value) ||
                isColorProperty(prop, effectiveDark.value)
              ) {
                const isImportant =
                  effectiveLight.important || effectiveDark.important;
                standardDecls.push([
                  prop,
                  formatDeclValue(
                    `light-dark(${effectiveLight.value}, ${effectiveDark.value})`,
                    isImportant,
                  ),
                ]);
                needsColorScheme = true;
              } else {
                if (baseDecl !== undefined) {
                  standardDecls.push([
                    prop,
                    formatDeclValue(baseDecl.value, baseDecl.important),
                  ]);
                  if (
                    lightDecl !== undefined &&
                    (lightDecl.value !== baseDecl.value ||
                      lightDecl.important !== baseDecl.important)
                  ) {
                    lightDecls.push([
                      prop,
                      formatDeclValue(lightDecl.value, lightDecl.important),
                    ]);
                  }
                  if (
                    darkDecl !== undefined &&
                    (darkDecl.value !== baseDecl.value ||
                      darkDecl.important !== baseDecl.important)
                  ) {
                    darkDecls.push([
                      prop,
                      formatDeclValue(darkDecl.value, darkDecl.important),
                    ]);
                  }
                } else {
                  if (lightDecl !== undefined) {
                    lightDecls.push([
                      prop,
                      formatDeclValue(lightDecl.value, lightDecl.important),
                    ]);
                  }
                  if (darkDecl !== undefined) {
                    darkDecls.push([
                      prop,
                      formatDeclValue(darkDecl.value, darkDecl.important),
                    ]);
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
        for (const [prop, decl] of declMap.entries()) {
          decls.push([prop, formatDeclValue(decl.value, decl.important)]);
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
