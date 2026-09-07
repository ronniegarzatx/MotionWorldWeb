import { createEmitter } from "../sensor/emitter.js";
import type { Unsubscribe } from "../sensor/types.js";
import type { Route } from "./router.js";

/**
 * App-shell UI state that is NOT acquisition state (the AcquisitionController
 * owns that). Kept as a plain, serializable object.
 */
export interface AppState {
  readonly route: Route;
}

export class AppStore {
  private state: AppState;
  private readonly changed = createEmitter<AppState>();

  constructor(initial: AppState) {
    this.state = initial;
  }

  get(): AppState {
    return this.state;
  }

  setRoute(route: Route): void {
    if (this.state.route === route) return;
    this.state = { ...this.state, route };
    this.changed.emit(this.state);
  }

  subscribe(listener: (s: AppState) => void): Unsubscribe {
    return this.changed.subscribe(listener);
  }
}
