import { z } from "zod";

const StylusSectionSchema = z.object({
  code: z.string(),
  domains: z.array(z.string()).optional(),
});

const StylusStyleItemSchema = z.object({
  id: z.number().int().optional(),
  _id: z.string().optional(),
  _rev: z.number().optional(),
  name: z.string().optional(),
  enabled: z.boolean().optional(),
  installDate: z.number().optional(),
  updateDate: z.number().optional(),
  sections: z.array(StylusSectionSchema),
});

const StylusSettingsItemSchema = z.object({
  settings: z.record(z.string(), z.unknown()),
});

export const StylusExportSchema = z.union([
  z.tuple([StylusSettingsItemSchema]).rest(StylusStyleItemSchema),
  z.array(StylusStyleItemSchema),
  z
    .object({
      styles: z.array(StylusStyleItemSchema),
    })
    .transform((val) => val.styles),
  StylusStyleItemSchema.transform((val) => [val]),
]);

const UbolCustomFilterEntrySchema = z.tuple([
  z.string().min(1),
  z.array(z.string().min(1)),
]);

const UbolFilteringModesSchema = z.object({
  none: z.array(z.string()).default([]),
  basic: z.array(z.string()).default([]),
  optimal: z.array(z.string()).default([]),
  complete: z.array(z.string()).default([]),
});

export const UbolConfigSchema = z.object({
  version: z.string(),
  filteringModes: UbolFilteringModesSchema,
  customFilters: z.array(UbolCustomFilterEntrySchema),
  sandboxFilters: z.array(z.string()),
});

export type StylusExport =
  | [
      z.infer<typeof StylusSettingsItemSchema>,
      ...z.infer<typeof StylusStyleItemSchema>[],
    ]
  | z.infer<typeof StylusStyleItemSchema>[];

export interface StylusRule {
  domain: string;
  code: string;
}

export type UbolConfig = z.infer<typeof UbolConfigSchema>;
