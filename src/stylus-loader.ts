import {
  StylusExportSchema,
  type StylusExport,
  type StylusRule,
} from "./schema.ts";

const loadStylusCSS = (stylusData: StylusExport): StylusRule[] => {
  const rules: StylusRule[] = [];
  const styleItems =
    stylusData.length > 0 && "settings" in stylusData[0]
      ? stylusData.slice(1)
      : stylusData;

  for (const item of styleItems) {
    if ("sections" in item && Array.isArray(item.sections)) {
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
  }
  return rules;
};

const parseStylusJson = (json: unknown): StylusExport => {
  return StylusExportSchema.parse(json);
};

export const parseStylusRules = (json: unknown): StylusRule[] => {
  return loadStylusCSS(parseStylusJson(json));
};
