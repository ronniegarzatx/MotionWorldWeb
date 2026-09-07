/** Tiny typed DOM helpers. No framework. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { dataset?: Record<string, string> } = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const { dataset, ...rest } = props;
  const node = Object.assign(document.createElement(tag), rest);
  if (dataset) for (const [k, v] of Object.entries(dataset)) node.dataset[k] = v;
  for (const c of children) if (c != null) node.append(c);
  return node;
}

export interface ButtonOptions {
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly variant?: "primary" | "ghost" | "default";
  readonly hidden?: boolean;
}

export function button(opts: ButtonOptions): HTMLButtonElement {
  const b = el("button", {
    className:
      "btn" +
      (opts.variant === "primary" ? " btn--primary" : "") +
      (opts.variant === "ghost" ? " btn--ghost" : ""),
    textContent: opts.label,
    disabled: opts.disabled ?? false,
  });
  b.hidden = opts.hidden ?? false;
  b.addEventListener("click", () => {
    if (!b.disabled) opts.onClick();
  });
  return b;
}

export interface TileOptions {
  readonly name: string;
  readonly note?: string;
  readonly active: boolean;
  readonly onOpen?: () => void;
}

export function tile(opts: TileOptions): HTMLButtonElement {
  const t = el(
    "button",
    { className: "tile" + (opts.active ? "" : " tile--disabled") },
    el("span", { className: "tile__name", textContent: opts.name }),
    opts.note ? el("span", { className: "tile__note", textContent: opts.note }) : null,
  );
  t.disabled = !opts.active;
  if (opts.active && opts.onOpen) t.addEventListener("click", opts.onOpen);
  return t;
}

export function stat(label: string, value: string): HTMLDivElement {
  return el(
    "div",
    { className: "stat" },
    el("span", { className: "stat__label", textContent: label }),
    el("span", { className: "stat__value", textContent: value }),
  );
}
