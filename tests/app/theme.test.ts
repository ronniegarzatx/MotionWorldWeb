// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  THEMES,
  applyTheme,
  initTheme,
  isThemeName,
  loadTheme,
  saveTheme,
  selectTheme,
} from "../../src/app/theme.js";

function fakeStore(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    _map: map,
  };
}

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

describe("theme model", () => {
  it("lists the four themes; midnight is the default", () => {
    expect(THEMES.map((t) => t.id)).toEqual(["midnight", "daylight", "dusk", "kusama"]);
    expect(DEFAULT_THEME).toBe("midnight");
    expect(THEMES.find((t) => t.id === "kusama")!.label).toBe("Kusama Dots");
  });

  it("isThemeName guards unknown values", () => {
    expect(isThemeName("dusk")).toBe(true);
    expect(isThemeName("neon")).toBe(false);
    expect(isThemeName(null)).toBe(false);
    expect(isThemeName(3)).toBe(false);
  });

  it("loadTheme reads a persisted valid theme, else the default", () => {
    expect(loadTheme(fakeStore({ "motion-world-theme": "kusama" }))).toBe("kusama");
    expect(loadTheme(fakeStore({ "motion-world-theme": "bogus" }))).toBe("midnight");
    expect(loadTheme(fakeStore())).toBe("midnight");
    expect(loadTheme(null)).toBe("midnight");
  });

  it("loadTheme survives a throwing storage", () => {
    const hostile = {
      getItem() {
        throw new Error("SecurityError");
      },
    };
    expect(loadTheme(hostile)).toBe("midnight");
  });

  it("saveTheme writes and swallows a throwing storage", () => {
    const store = fakeStore();
    saveTheme("dusk", store);
    expect(store._map.get("motion-world-theme")).toBe("dusk");
    expect(() =>
      saveTheme("dusk", {
        setItem() {
          throw new Error("QuotaExceeded");
        },
      }),
    ).not.toThrow();
  });

  it("applyTheme sets data-theme on the root", () => {
    const root = document.createElement("div");
    applyTheme("daylight", root);
    expect(root.dataset.theme).toBe("daylight");
  });

  it("initTheme applies a theme to <html> and never throws without storage", () => {
    expect(() => initTheme()).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe(DEFAULT_THEME);
  });

  it("selectTheme applies to the root and never throws without storage", () => {
    const root = document.createElement("div");
    expect(() => selectTheme("kusama", root)).not.toThrow();
    expect(root.dataset.theme).toBe("kusama");
  });
});
