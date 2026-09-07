/**
 * Why a run stopped. Shared by the acquisition state machine and the stored-run
 * model. `null` = not stopped / unknown.
 *
 *   ui         — the on-screen Stop button
 *   trigger    — the physical blue button (or an immediate-start trigger edge)
 *   navigation — the teacher left the tool mid-run
 *   device_lost— the sensor was unplugged / stopped responding
 *   error      — the sensor errored
 */
export type StopReason =
  | "ui"
  | "trigger"
  | "navigation"
  | "device_lost"
  | "error"
  | null;

/** A run that ended for one of these reasons is "interrupted" / partial. */
export function isInterrupted(reason: StopReason): boolean {
  return reason === "navigation" || reason === "device_lost" || reason === "error";
}
