import { z } from "zod";
import { splitSelectorList } from "./converter.ts";

export const UbolConfigSchema = z
  .object({
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
  })
  .loose();

export type UbolConfig = z.infer<typeof UbolConfigSchema>;

const UbolLegacyBackupSchema = z
  .object({
    userResources: z.object({
      userFilters: z.string(),
    }),
    schemaVersion: z.literal(1).optional().default(1),
  })
  .loose();

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
  existingConfig?: Partial<UbolConfig> | Record<string, unknown>,
): UbolConfig => {
  const map = new Map<string, Set<string>>();

  // 1. If existingConfig already has customFilters, initialize map with them
  // to ensure existing custom filters are preserved.
  if (
    existingConfig &&
    "customFilters" in existingConfig &&
    Array.isArray(existingConfig.customFilters)
  ) {
    for (const item of existingConfig.customFilters) {
      if (Array.isArray(item) && item.length >= 2) {
        const domain =
          typeof item[0] === "string" ? item[0].trim() : String(item[0]).trim();
        const rawSelectors: unknown = item[1];
        if (domain.length > 0 && Array.isArray(rawSelectors)) {
          const set = map.get(domain) ?? new Set<string>();
          map.set(domain, set);
          for (const s of rawSelectors) {
            const trimmed = typeof s === "string" ? s.trim() : String(s).trim();
            if (trimmed.length > 0) {
              set.add(trimmed);
            }
          }
        }
      }
    }
  }

  // 2. Parse new filter text
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
      if (d.length === 0) continue;
      const set = map.get(d) ?? new Set<string>();
      map.set(d, set);
      for (const sel of subSelectors) {
        const trimmed = sel.trim();
        if (trimmed.length > 0) {
          set.add(trimmed);
        }
      }
    }
  }

  // 3. Sort domains and selectors deterministically (alphabetically)
  const sortedDomains = Array.from(map.keys())
    .filter((d) => d.length > 0)
    .sort();
  const customFilters: [string, string[]][] = [];
  for (const domain of sortedDomains) {
    const set = map.get(domain);
    if (set && set.size > 0) {
      const sortedSelectors = Array.from(set).sort();
      customFilters.push([domain, sortedSelectors]);
    }
  }

  // 4. Preserve all original configuration settings outside customFilters
  const baseConfig: Record<string, unknown> = existingConfig ?? {};
  const filteringModes =
    typeof baseConfig.filteringModes === "object" &&
    baseConfig.filteringModes !== null
      ? (baseConfig.filteringModes as UbolConfig["filteringModes"])
      : {
          none: [],
          basic: [],
          optimal: ["all-urls"],
          complete: [],
        };

  const result: UbolConfig = {
    ...baseConfig,
    version:
      typeof baseConfig.version === "string"
        ? baseConfig.version
        : new Date().toISOString().slice(0, 10).replace(/-/g, "."),
    filteringModes,
    customFilters,
  };

  return UbolConfigSchema.parse(result);
};

export const getFiltersFromBackup = (backup: UbolBackup): string => {
  if (isUbolConfig(backup)) {
    return ubolConfigToFilterText(backup);
  }
  return backup.userResources.userFilters;
};
