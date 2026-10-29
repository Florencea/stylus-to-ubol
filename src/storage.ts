import { z } from "zod";

export const STORAGE_KEY_UBOL_BASE = "stylus_to_ubol_base_config";

const StoredBaseConfigSchema = z.object({
  rawText: z.string(),
  fileName: z.string(),
  savedAt: z.number(),
});

export type StoredBaseConfig = z.infer<typeof StoredBaseConfigSchema>;

export const getLocalStorage = (): Storage | null => {
  try {
    if (typeof window !== "undefined" && window.localStorage !== undefined) {
      return window.localStorage;
    }
    if (typeof localStorage !== "undefined") {
      return localStorage;
    }
    return null;
  } catch {
    return null;
  }
};

export const isLocalStorageAvailable = (): boolean => {
  const storage = getLocalStorage();
  if (storage === null) return false;
  try {
    const testKey = "__storage_test__";
    storage.setItem(testKey, testKey);
    storage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
};

export const loadStoredBaseConfig = (): StoredBaseConfig | null => {
  const storage = getLocalStorage();
  if (storage === null) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY_UBOL_BASE);
    if (raw === null) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      storage.removeItem(STORAGE_KEY_UBOL_BASE);
      return null;
    }

    const result = StoredBaseConfigSchema.safeParse(parsed);
    if (!result.success) {
      storage.removeItem(STORAGE_KEY_UBOL_BASE);
      return null;
    }
    return result.data;
  } catch {
    return null;
  }
};

export const saveStoredBaseConfig = (rawText: string, fileName: string): boolean => {
  const storage = getLocalStorage();
  if (storage === null) return false;
  try {
    const data: StoredBaseConfig = {
      rawText,
      fileName,
      savedAt: Date.now(),
    };
    storage.setItem(STORAGE_KEY_UBOL_BASE, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
};

export const clearStoredBaseConfig = (): void => {
  const storage = getLocalStorage();
  if (storage === null) return;
  try {
    storage.removeItem(STORAGE_KEY_UBOL_BASE);
  } catch {
    // Graceful fallback
  }
};

export const isCacheAvailable = (): boolean => {
  return loadStoredBaseConfig() !== null;
};
