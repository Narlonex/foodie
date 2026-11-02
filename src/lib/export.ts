export interface CsvColumn {
  key: string;
  label: string;
}

/** Escapes one CSV cell; quotes, commas and line breaks are preserved safely. */
export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function rowsToCsv(
  columns: ReadonlyArray<CsvColumn>,
  rows: ReadonlyArray<Record<string, unknown>>,
): string {
  const lines = [
    columns.map((column) => csvEscape(column.label)).join(","),
    ...rows.map((row) =>
      columns.map((column) => csvEscape(row[column.key])).join(","),
    ),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

export const DIARY_CSV_COLUMNS: ReadonlyArray<CsvColumn> = [
  { key: "date", label: "date" },
  { key: "meal", label: "meal" },
  { key: "name", label: "name" },
  { key: "brand", label: "brand" },
  { key: "barcode", label: "barcode" },
  { key: "amount", label: "amount" },
  { key: "amount_unit", label: "amount_unit" },
  { key: "kcal", label: "kcal" },
  { key: "protein_g", label: "protein_g" },
  { key: "carbs_g", label: "carbs_g" },
  { key: "sugars_g", label: "sugars_g" },
  { key: "fat_g", label: "fat_g" },
  { key: "sat_fat_g", label: "sat_fat_g" },
  { key: "fiber_g", label: "fiber_g" },
  { key: "salt_g", label: "salt_g" },
  { key: "energy_source", label: "energy_source" },
  { key: "preparation", label: "preparation" },
  { key: "logged_at", label: "logged_at" },
];

export function diaryRowsToCsv(
  rows: ReadonlyArray<Record<string, unknown>>,
): string {
  return rowsToCsv(DIARY_CSV_COLUMNS, rows);
}
