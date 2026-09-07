/**
 * Boot-time URL flags, parsed once. Query string only — hash navigation never
 * changes these.
 *
 *   ?fake           run against FakeSensorAdapter (no hardware)
 *   ?debug=sensor   expose the developer Sensor Diagnostics view (#/diagnostics)
 */
export interface Flags {
  readonly fake: boolean;
  readonly debugSensor: boolean;
}

export function parseFlags(search: string): Flags {
  const params = new URLSearchParams(search);
  return {
    fake: params.has("fake"),
    debugSensor: params.get("debug") === "sensor",
  };
}

export function readFlags(loc: { search: string } = window.location): Flags {
  return parseFlags(loc.search);
}
