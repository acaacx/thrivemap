// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DISPLAY_PREFS,
  DISPLAY_PREFS_BOOT_SCRIPT,
  DISPLAY_PREFS_STORAGE_KEY,
  applyDisplayPrefs,
  readDisplayPrefs,
  writeDisplayPrefs,
} from "./display-prefs";

// jsdom's localStorage is not writable in this setup; stub a minimal one so
// the module (and the boot script) read/write through window.localStorage.
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
})();

vi.stubGlobal("localStorage", mockLocalStorage);

describe("display preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
    for (const attr of document.documentElement.getAttributeNames()) {
      if (attr.startsWith("data-"))
        document.documentElement.removeAttribute(attr);
    }
  });

  it("reads defaults when nothing is stored or the value is garbage", () => {
    expect(readDisplayPrefs()).toEqual(DEFAULT_DISPLAY_PREFS);
    window.localStorage.setItem(DISPLAY_PREFS_STORAGE_KEY, "{not json");
    expect(readDisplayPrefs()).toEqual(DEFAULT_DISPLAY_PREFS);
  });

  it("round-trips and ignores unknown or non-boolean keys", () => {
    writeDisplayPrefs({ ...DEFAULT_DISPLAY_PREFS, reduceMotion: true });
    window.localStorage.setItem(
      DISPLAY_PREFS_STORAGE_KEY,
      JSON.stringify({ reduceMotion: true, largerText: "yes", bogus: true }),
    );
    expect(readDisplayPrefs()).toEqual({
      ...DEFAULT_DISPLAY_PREFS,
      reduceMotion: true,
    });
  });

  it("stamps and clears data attributes on <html>", () => {
    applyDisplayPrefs({ ...DEFAULT_DISPLAY_PREFS, largerText: true });
    expect(document.documentElement.hasAttribute("data-text-lg")).toBe(true);
    expect(document.documentElement.hasAttribute("data-reduce-motion")).toBe(
      false,
    );
    applyDisplayPrefs(DEFAULT_DISPLAY_PREFS);
    expect(document.documentElement.hasAttribute("data-text-lg")).toBe(false);
  });

  it("boot script applies stored preferences before hydration", () => {
    window.localStorage.setItem(
      DISPLAY_PREFS_STORAGE_KEY,
      JSON.stringify({ higherContrast: true, moreSpacing: false }),
    );
    // eslint-disable-next-line no-new-func
    new Function(DISPLAY_PREFS_BOOT_SCRIPT)();
    expect(document.documentElement.hasAttribute("data-contrast-hi")).toBe(
      true,
    );
    expect(document.documentElement.hasAttribute("data-spacing-lg")).toBe(
      false,
    );
  });
});
