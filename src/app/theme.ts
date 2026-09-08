/**
 * Global theme system — a tokenised presentation layer only. No model or
 * controller coupling: a theme just sets `data-theme` on the document root, and
 * `src/styles/themes.css` redefines design tokens for that value. The chosen
 * theme persists in `localStorage` (best-effort — private windows and some
 * `file://` contexts deny storage, and we degrade to the default silently).
 */

export type ThemeName = "midnight" | "daylight" | "dusk" | "kusama";

export interface ThemeOption {
  readonly id: ThemeName;
  readonly label: string;
}

export const THEMES: readonly ThemeOption[] = [
  { id: "midnight", label: "Midnight" },
  { id: "daylight", label: "Daylight" },
  { id: "dusk", label: "Dusk" },
  { id: "kusama", label: "Kusama Dots" },
];

export const DEFAULT_THEME: ThemeName = "midnight";

const STORAGE_KEY = "motion-world-theme";

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === "string" && THEMES.some((t) => t.id === value);
}

type ReadStore = Pick<Storage, "getItem">;
type WriteStore = Pick<Storage, "setItem">;

function safeStorage(): Storage | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
    if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
      return (globalThis as unknown as { localStorage: Storage }).localStorage;
    }
    if (typeof window !== "undefined") return window.localStorage;
    return null;
  } catch {
    return null;
  }
}

export function loadTheme(store: ReadStore | null = safeStorage()): ThemeName {
  try {
    const stored = store?.getItem(STORAGE_KEY);
    return isThemeName(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveTheme(name: ThemeName, store: WriteStore | null = safeStorage()): void {
  try {
    store?.setItem(STORAGE_KEY, name);
  } catch {
    /* storage denied — the theme still applies for this session */
  }
}

export function applyTheme(
  name: ThemeName,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.theme = name;
}

/** Apply the persisted theme (or the default). Call once, before first paint. */
export function initTheme(root: HTMLElement = document.documentElement): ThemeName {
  const name = loadTheme();
  applyTheme(name, root);
  return name;
}

/** Apply + persist in one step (the theme picker's action). */
export function selectTheme(
  name: ThemeName,
  root: HTMLElement = document.documentElement,
): void {
  applyTheme(name, root);
  saveTheme(name);
}
