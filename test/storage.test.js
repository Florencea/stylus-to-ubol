import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { ZodError } from "zod";
import {
  clearStoredBaseConfig,
  getLocalStorage,
  isCacheAvailable,
  isLocalStorageAvailable,
  loadStoredBaseConfig,
  saveStoredBaseConfig,
  STORAGE_KEY_UBOL_BASE,
} from "../src/storage.js";

class MemoryStorage {
  #store = new Map();

  get length() {
    return this.#store.size;
  }

  clear() {
    this.#store.clear();
  }

  getItem(key) {
    return this.#store.get(key) ?? null;
  }

  key(index) {
    return Array.from(this.#store.keys())[index] ?? null;
  }

  removeItem(key) {
    this.#store.delete(key);
  }

  setItem(key, value) {
    this.#store.set(key, value);
  }
}

describe("Storage Service", () => {
  let originalStorageDescriptor;

  beforeEach(() => {
    originalStorageDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    );
    Object.defineProperty(globalThis, "localStorage", {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
      enumerable: originalStorageDescriptor?.enumerable ?? false,
    });
  });

  afterEach(() => {
    if (originalStorageDescriptor !== undefined) {
      Object.defineProperty(
        globalThis,
        "localStorage",
        originalStorageDescriptor,
      );
    } else {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  });

  it("checks localStorage availability accurately", () => {
    assert.equal(isLocalStorageAvailable(), true);
  });

  it("returns null when no base config is stored", () => {
    assert.equal(loadStoredBaseConfig(), null);
    assert.equal(isCacheAvailable(), false);
  });

  it("saves and loads base config correctly", () => {
    const rawText = JSON.stringify({ customFilters: [] });
    const fileName = "test-ubol.json";

    const saved = saveStoredBaseConfig(rawText, fileName);
    assert.equal(saved, true);
    assert.equal(isCacheAvailable(), true);

    const loaded = loadStoredBaseConfig();
    assert.notEqual(loaded, null);
    assert.equal(loaded.rawText, rawText);
    assert.equal(loaded.fileName, fileName);
    assert.equal(typeof loaded.savedAt, "number");
  });

  it("throws ZodError when saveStoredBaseConfig receives invalid types", () => {
    assert.throws(() => saveStoredBaseConfig(123, "test.json"), ZodError);
    assert.throws(() => saveStoredBaseConfig("{}", null), ZodError);
  });

  it("clears stored base config correctly", () => {
    saveStoredBaseConfig("{}", "dummy.json");
    assert.equal(isCacheAvailable(), true);

    clearStoredBaseConfig();
    assert.equal(loadStoredBaseConfig(), null);
    assert.equal(isCacheAvailable(), false);
  });

  it("handles corrupted JSON in localStorage gracefully and cleans up", () => {
    const storage = getLocalStorage();
    storage?.setItem(STORAGE_KEY_UBOL_BASE, "invalid json {");
    assert.equal(loadStoredBaseConfig(), null);
    assert.equal(storage?.getItem(STORAGE_KEY_UBOL_BASE), null);
  });

  it("handles invalid schema shape in localStorage gracefully and cleans up", () => {
    const storage = getLocalStorage();
    storage?.setItem(
      STORAGE_KEY_UBOL_BASE,
      JSON.stringify({ wrongField: 123 }),
    );
    assert.equal(loadStoredBaseConfig(), null);
    assert.equal(storage?.getItem(STORAGE_KEY_UBOL_BASE), null);
  });
});
