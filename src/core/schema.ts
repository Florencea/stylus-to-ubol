import { z } from "zod";

export const UbolBackupSchema = z.object({
  userResources: z.object({
    userFilters: z.string(),
  }),
  schemaVersion: z.literal(1),
});

export type UbolBackup = z.infer<typeof UbolBackupSchema>;
