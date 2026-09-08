import { THEMES, selectTheme, type ThemeName } from "../app/theme.js";
import { el } from "./components/dom.js";

export interface ThemePickerOptions {
  readonly initial: ThemeName;
  /** called after the theme has been applied + persisted */
  readonly onChange?: (name: ThemeName) => void;
}

/**
 * The header theme control. A plain `<select>` — keyboard-friendly, no popover
 * machinery, and it reads well on a projector.
 */
export function mountThemePicker(host: HTMLElement, opts: ThemePickerOptions): () => void {
  const select = el("select", { className: "theme-select" });
  select.setAttribute("aria-label", "Theme");

  for (const theme of THEMES) {
    const option = el("option", { value: theme.id, textContent: theme.label });
    if (theme.id === opts.initial) option.selected = true;
    select.append(option);
  }

  const onChange = (): void => {
    const name = select.value as ThemeName;
    selectTheme(name);
    opts.onChange?.(name);
  };
  select.addEventListener("change", onChange);

  host.append(select);
  return () => {
    select.removeEventListener("change", onChange);
    select.remove();
  };
}
