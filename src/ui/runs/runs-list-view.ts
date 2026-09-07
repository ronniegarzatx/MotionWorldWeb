import type { Route } from "../../app/router.js";
import type { RunStore } from "../../store/run-store.js";
import type { StoredRunSummary } from "../../model/stored-run.js";
import { button, el } from "../components/dom.js";
import { formatDuration, formatSavedAt, interruptedLabel } from "./format.js";

export interface RunsListDeps {
  readonly store: RunStore;
  readonly navigate: (route: Route, param?: string) => void;
}

export function mountRunsListView(host: HTMLElement, deps: RunsListDeps): () => void {
  const { store } = deps;
  let disposed = false;

  const root = el("div", { className: "runs-list" });
  host.append(root);

  const render = (summaries: readonly StoredRunSummary[]): void => {
    if (disposed) return;
    root.replaceChildren();
    root.append(el("h1", { className: "runs-title", textContent: "Runs" }));

    if (store.kind === "memory") {
      root.append(
        el("p", {
          className: "runs-banner",
          textContent: "Temporary storage — runs will be lost when this page closes.",
        }),
      );
    }

    if (summaries.length === 0) {
      root.append(
        el("div", { className: "runs-empty" },
          el("p", { className: "runs-empty__head", textContent: "NO SAVED RUNS YET" }),
          el("p", { textContent: "Completed collections will appear here automatically." }),
        ),
      );
      return;
    }

    root.append(clearAllControl(summaries.length));

    const list = el("div", { className: "runs-rows" });
    for (const s of summaries) list.append(row(s));
    root.append(list);
  };

  const clearAllControl = (count: number): HTMLElement => {
    const wrap = el("div", { className: "runs-clear" });
    const clearBtn = button({
      label: "Clear All Runs",
      variant: "ghost",
      onClick: () => {
        wrap.replaceChildren(
          el("span", { textContent: `Really clear ${count} run${count === 1 ? "" : "s"}? ` }),
          button({
            label: "Clear",
            variant: "primary",
            onClick: () => {
              void store.clear().then(refresh);
            },
          }),
          button({ label: "Cancel", variant: "ghost", onClick: () => wrap.replaceChildren(clearBtn) }),
        );
      },
    });
    wrap.append(clearBtn);
    return wrap;
  };

  const row = (s: StoredRunSummary): HTMLElement => {
    const interrupted = interruptedLabel(s.stopReason);
    const meta = el(
      "div",
      { className: "run-row__meta" },
      el("span", { className: "run-row__when", textContent: formatSavedAt(s.savedAtEpochMs) }),
      el("span", { textContent: `${formatDuration(s.durationSeconds)} · ${s.sampleCount} samples` }),
      s.source === "fake"
        ? el("span", { className: "run-row__tag", textContent: "demo" })
        : null,
      interrupted ? el("span", { className: "run-row__chip", textContent: interrupted }) : null,
    );

    const actions = el(
      "div",
      { className: "run-row__actions" },
      button({ label: "View", onClick: () => deps.navigate("run", s.id) }),
      deleteControl(s),
    );

    return el("div", { className: "run-row" }, meta, actions);
  };

  const deleteControl = (s: StoredRunSummary): HTMLElement => {
    const wrap = el("span");
    const del = button({
      label: "Delete",
      variant: "ghost",
      onClick: () => {
        wrap.replaceChildren(
          button({
            label: "Confirm delete",
            variant: "primary",
            onClick: () => {
              void store.delete(s.id).then(refresh);
            },
          }),
          button({ label: "Keep", variant: "ghost", onClick: () => wrap.replaceChildren(del) }),
        );
      },
    });
    wrap.append(del);
    return wrap;
  };

  const refresh = (): void => {
    void store.listSummaries().then(render);
  };

  refresh();

  return () => {
    disposed = true;
    root.remove();
  };
}
