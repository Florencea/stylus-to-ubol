import { z } from "zod";
import {
  extractMatchesMedia,
  parseCosmeticPattern,
  splitSelectorList,
} from "./converter.ts";

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
    sandboxFilters: z.array(z.string()).optional(),
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
  if (Array.isArray(config.sandboxFilters)) {
    for (const rule of config.sandboxFilters) {
      const trimmed = rule.trim();
      if (trimmed.length > 0) {
        lines.push(trimmed);
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
  const sandboxSet = new Set<string>();

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

  // 1b. If existingConfig already has sandboxFilters, preserve them
  if (
    existingConfig &&
    "sandboxFilters" in existingConfig &&
    Array.isArray(existingConfig.sandboxFilters)
  ) {
    for (const item of existingConfig.sandboxFilters) {
      const trimmed =
        typeof item === "string" ? item.trim() : String(item).trim();
      if (trimmed.length > 0) {
        sandboxSet.add(trimmed);
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

    if (rest.length === 0) continue;

    const rawDomains =
      domainPart.length > 0 ? domainPart.split(",").map((d) => d.trim()) : [];
    const domains =
      rawDomains.length > 0 && rawDomains.some((d) => d.length > 0)
        ? rawDomains.filter((d) => d.length > 0)
        : ["*"];

    if (rest.includes(":style(")) {
      // Style injection rules go directly into sandboxFilters
      const parsed = parseCosmeticPattern(rest);
      if (parsed?.styleContent !== undefined) {
        const mm = extractMatchesMedia(parsed.selector);
        if (mm && mm.restSelector.length > 0) {
          const subSelectors = splitSelectorList(mm.restSelector);
          for (const d of domains) {
            for (const sub of subSelectors) {
              sandboxSet.add(
                `${d}##:matches-media(${mm.mediaQuery}) ${sub}:style(${parsed.styleContent})`,
              );
            }
          }
        } else {
          const subSelectors = splitSelectorList(parsed.selector);
          for (const d of domains) {
            for (const sub of subSelectors) {
              sandboxSet.add(`${d}##${sub}:style(${parsed.styleContent})`);
            }
          }
        }
      } else {
        for (const d of domains) {
          sandboxSet.add(`${d}##${rest}`);
        }
      }
    } else {
      // Pure cosmetic hide rules go into customFilters
      const subSelectors = splitSelectorList(rest);
      for (const d of domains) {
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

  const sortedSandboxFilters = Array.from(sandboxSet).sort();

  // 4. Preserve all original configuration settings outside customFilters and sandboxFilters
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
        : "2026.920.1710",
    filteringModes,
    customFilters,
    sandboxFilters: sortedSandboxFilters,
  };

  return UbolConfigSchema.parse(result);
};

export const getFiltersFromBackup = (backup: UbolBackup): string => {
  if (isUbolConfig(backup)) {
    return ubolConfigToFilterText(backup);
  }
  return backup.userResources.userFilters;
};
