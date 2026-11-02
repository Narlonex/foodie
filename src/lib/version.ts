/** Numeric comparison for the simple MAJOR.MINOR.PATCH versions used by APKs. */
export function parseVersion(value: string): number[] | null {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d+){0,2}$/.test(trimmed)) return null;
  return trimmed.split(".").map(Number);
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const next = parseVersion(candidate);
  const previous = parseVersion(current);
  if (!next || !previous) return false;

  const length = Math.max(next.length, previous.length);
  for (let index = 0; index < length; index += 1) {
    const a = next[index] ?? 0;
    const b = previous[index] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}
