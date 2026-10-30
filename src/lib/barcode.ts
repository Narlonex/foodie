/** Strips spaces, dashes and scanner noise, then validates the numeric code. */
export function normalizeBarcode(value: string): string | null {
  const digits = value.replace(/[^0-9]/g, "");
  return digits.length >= 6 && digits.length <= 20 ? digits : null;
}

/**
 * Open Food Facts normally stores EAN-13, while a US package often exposes a
 * 12-digit UPC-A. The same product code can therefore be valid with or without
 * a leading zero; try the literal scan first and the padded/trimmed form next.
 */
export function barcodeLookupCandidates(code: string): string[] {
  if (code.length === 12) return [code, `0${code}`];
  if (code.length === 13 && code.startsWith("0")) return [code, code.slice(1)];
  return [code];
}
