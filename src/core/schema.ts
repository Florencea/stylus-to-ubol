import { z } from "zod";
import { splitSelectorList } from "./converter.ts";

export const UbolConfigSchema = z.object({
  version: z.string().optional(),
  filteringModes: z
    .object({
      none: z.array(z.string()).default([]),
      basic: z.array(z.string()).default([]),
      optimal: z.array(z.string()).default([]),
      complete: z.array(z.string()).default([]),
    })
    .optional(),
  customFilters: z.array(z.tuple([z.string(), z.array(z.string())])),
});

export type UbolConfig = z.infer<typeof UbolConfigSchema>;

export const UbolLegacyBackupSchema = z.object({
  userResources: z.object({
    userFilters: z.string(),
  }),
  schemaVersion: z.literal(1).optional().default(1),
});

export type UbolLegacyBackup = z.infer<typeof UbolLegacyBackupSchema>;

export const UbolBackupSchema = z.union([
  UbolConfigSchema,
  UbolLegacyBackupSchema,
]);

export type UbolBackup = z.infer<typeof UbolBackupSchema>;

export const isUbolConfig = (data: unknown): data is UbolConfig => {
  return (
    typeof data === "object" &&
    data !== null &&
    "customFilters" in data &&
    Array.isArray(data.customFilters)
  );
};

export const ubolConfigToFilterText = (config: UbolConfig): string => {
  const lines: string[] = [];
  for (const [hostname, selectors] of config.customFilters) {
    const prefix = hostname.length > 0 ? `${hostname}##` : "##";
    for (const sel of selectors) {
      const trimmed = sel.trim();
      if (trimmed.length > 0) {
        lines.push(`${prefix}${trimmed}`);
      }
    }
  }
  return lines.join("\n");
};

export const filterTextToUbolConfig = (
  filters: string,
  existingConfig?: Partial<UbolConfig>,
): UbolConfig => {
  const map = new Map<string, Set<string>>();

  const lines = filters.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("!") || line.startsWith("#")) {
      continue;
    }

    const hashIdx = line.indexOf("##");
    if (hashIdx === -1) continue;

    const domainPart = line.slice(0, hashIdx).trim();
    const rest = line.slice(hashIdx + 2).trim();

    // Pure cosmetic hide rules only for uBOL native customFilters
    if (rest.includes(":style(")) continue;

    const domains =
      domainPart.length > 0 ? domainPart.split(",").map((d) => d.trim()) : [""];
    const subSelectors = splitSelectorList(rest);

    for (const d of domains) {
      const set = map.get(d) ?? new Set<string>();
      map.set(d, set);
      for (const sel of subSelectors) {
        set.add(sel);
      }
    }
  }

  const customFilters: [string, string[]][] = [];
  for (const [domain, set] of map.entries()) {
    if (domain.length > 0 && set.size > 0) {
      customFilters.push([domain, Array.from(set)]);
    }
  }

  return {
    version:
      existingConfig?.version ??
      new Date().toISOString().slice(0, 10).replace(/-/g, "."),
    filteringModes: existingConfig?.filteringModes ?? {
      none: [],
      basic: [],
      optimal: ["all-urls"],
      complete: [],
    },
    customFilters,
  };
};

export const getFiltersFromBackup = (backup: UbolBackup): string => {
  if (isUbolConfig(backup)) {
    return ubolConfigToFilterText(backup);
  }
  return backup.userResources.userFilters;
};
