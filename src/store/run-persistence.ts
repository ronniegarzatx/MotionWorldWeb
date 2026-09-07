import type { AcquisitionController } from "../acquisition/acquisition-controller.js";
import { serializeRun } from "../model/stored-run.js";
import type { Unsubscribe } from "../sensor/types.js";
import type { RunStore } from "./run-store.js";

export interface RunPersistenceOptions {
  readonly onSaved?: (id: string) => void;
  readonly onError?: (id: string, error: unknown) => void;
  readonly now?: () => number;
}

/**
 * The ONE place that persists completed runs. Built once in the composition root
 * — never per view. Subscribes to the controller's single run-complete event and
 * saves each frozen MotionRun exactly once (a `Set<id>` guard covers route
 * remounts and any double-emit). A save failure is reported and swallowed —
 * acquisition is never affected.
 *
 * Every run is retained, including partial ones (navigation / device_lost /
 * error) — the `stopReason` rides through into the StoredRun so the Runs view
 * can flag them. Partial runs are not auto-deleted.
 */
export function startRunPersistence(
  controller: AcquisitionController,
  store: RunStore,
  opts: RunPersistenceOptions = {},
): Unsubscribe {
  const saved = new Set<string>();
  const now = opts.now ?? (() => Date.now());

  return controller.subscribeRunComplete((run) => {
    if (saved.has(run.id)) return;
    saved.add(run.id);
    void store.save(serializeRun(run, now())).then(
      () => opts.onSaved?.(run.id),
      (error: unknown) => {
        saved.delete(run.id); // allow a retry on a later identical emit
        opts.onError?.(run.id, error);
      },
    );
  });
}
