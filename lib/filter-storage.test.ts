import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import {
  readStoredFilterState,
  writeStoredFilterState,
  clearStoredFilterState,
  DEFAULT_STORAGE_KEY,
} from "./filter-storage";

describe("filter-storage", () => {
  it("returns null safely when window is undefined (SSR)", () => {
    // In Node test runner, window is undefined
    const state = readStoredFilterState();
    assert.strictEqual(state, null);
    assert.strictEqual(writeStoredFilterState({ test: 123 }), false);
    assert.doesNotThrow(() => clearStoredFilterState());
  });

  describe("in simulated browser environment", () => {
    let mockLocalStorage: Record<string, string>;
    let mockSessionStorage: Record<string, string>;

    beforeEach(() => {
      mockLocalStorage = {};
      mockSessionStorage = {};

      (globalThis as any).window = {
        localStorage: {
          getItem: (k: string) => mockLocalStorage[k] || null,
          setItem: (k: string, v: string) => {
            mockLocalStorage[k] = v;
          },
          removeItem: (k: string) => {
            delete mockLocalStorage[k];
          },
        },
        sessionStorage: {
          getItem: (k: string) => mockSessionStorage[k] || null,
          setItem: (k: string, v: string) => {
            mockSessionStorage[k] = v;
          },
          removeItem: (k: string) => {
            delete mockSessionStorage[k];
          },
        },
      };
    });

    it("writes and reads state to storage safely", () => {
      const payload = { search: "test", page: 2 };
      const success = writeStoredFilterState(payload);
      assert.strictEqual(success, true);

      const retrieved = readStoredFilterState<typeof payload>();
      assert.deepStrictEqual(retrieved, payload);
    });

    it("handles corrupt JSON in storage gracefully", () => {
      mockLocalStorage[DEFAULT_STORAGE_KEY] = "{invalid-json";
      const retrieved = readStoredFilterState();
      assert.strictEqual(retrieved, null);
    });

    it("clears all storage keys cleanly", () => {
      writeStoredFilterState({ page: 5 });
      assert.notStrictEqual(mockLocalStorage[DEFAULT_STORAGE_KEY], undefined);

      clearStoredFilterState();
      assert.strictEqual(mockLocalStorage[DEFAULT_STORAGE_KEY], undefined);
      assert.strictEqual(mockSessionStorage[DEFAULT_STORAGE_KEY], undefined);
    });
  });
});

