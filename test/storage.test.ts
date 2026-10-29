import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  clearStoredBaseConfig,
  getLocalStorage,
  isCacheAvailable,
  isLocalStorageAvailable,
  loadStoredBaseConfig,
  saveStoredBaseConfig,
  STORAGE_KEY_UBOL_BASE,
} from "../src/storage.ts";

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe("Storage Service", () => {
  let originalStorage: Storage | undefined;

  beforeEach(() => {
    originalStorage = globalThis.localStorage;
    globalThis.localStorage = new MemoryStorage();
  });

  afterEach(() => {
    if (originalStorage !== undefined) {
      globalThis.localStorage = originalStorage;
    } else {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  });

  it("checks localStorage availability accurately", () => {
    expect(isLocalStorageAvailable()).toBe(true);
  });

  it("returns null when no base config is stored", () => {
    expect(loadStoredBaseConfig()).toBeNull();
    expect(isCacheAvailable()).toBe(false);
  });

  it("saves and loads base config correctly", () => {
    const rawText = JSON.stringify({ customFilters: [] });
    const fileName = "test-ubol.json";

    const saved = saveStoredBaseConfig(rawText, fileName);
    expect(saved).toBe(true);
    expect(isCacheAvailable()).toBe(true);

    const loaded = loadStoredBaseConfig();
    expect(loaded).not.toBeNull();
    expect(loaded?.rawText).toBe(rawText);
    expect(loaded?.fileName).toBe(fileName);
    expect(typeof loaded?.savedAt).toBe("number");
  });

  it("clears stored base config correctly", () => {
    saveStoredBaseConfig("{}", "dummy.json");
    expect(isCacheAvailable()).toBe(true);

    clearStoredBaseConfig();
    expect(loadStoredBaseConfig()).toBeNull();
    expect(isCacheAvailable()).toBe(false);
  });

  it("handles corrupted JSON in localStorage gracefully and cleans up", () => {
    const storage = getLocalStorage();
    storage?.setItem(STORAGE_KEY_UBOL_BASE, "invalid json {");
    expect(loadStoredBaseConfig()).toBeNull();
    expect(storage?.getItem(STORAGE_KEY_UBOL_BASE)).toBeNull();
  });

  it("handles invalid schema shape in localStorage gracefully and cleans up", () => {
    const storage = getLocalStorage();
    storage?.setItem(STORAGE_KEY_UBOL_BASE, JSON.stringify({ wrongField: 123 }));
    expect(loadStoredBaseConfig()).toBeNull();
    expect(storage?.getItem(STORAGE_KEY_UBOL_BASE)).toBeNull();
  });
});
