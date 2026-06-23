/**
 * Parse route/body IDs — rejects missing, non-numeric, and non-positive values.
 */
export function parseEntityId(value, label = "id") {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid ${label}`);
  }
  return n;
}

export function tryParseEntityId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}
