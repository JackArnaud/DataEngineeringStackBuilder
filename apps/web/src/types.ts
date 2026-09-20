/** What the detail panel is showing. `null` means it is closed. */
export type Detail = { kind: "tool"; id: string } | { kind: "zone"; zone: string } | { kind: "gap"; id: string };
