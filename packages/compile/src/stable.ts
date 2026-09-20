/**
 * JSON with object keys sorted, so the same data always serialises to the same bytes. The
 * render model is a build artifact that golden tests compare and git diffs, so ordering
 * must never depend on how it was built.
 */
export function stableStringify(value: unknown, indent = 2): string {
  return `${JSON.stringify(sortKeys(value), null, indent)}\n`;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .filter((k) => record[k] !== undefined)
        .map((k) => [k, sortKeys(record[k])]),
    );
  }
  return value;
}
