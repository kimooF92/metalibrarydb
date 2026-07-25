import * as XLSX from "xlsx";

/**
 * Parses a CSV or XLSX Buffer/ArrayBuffer and extracts URLs from the first column or column named 'url'.
 */
export function parseImportFile(fileBuffer: Buffer): string[] {
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return [];
  }

  const sheet = workbook.Sheets[firstSheetName];
  // Parse rows as 2D array
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  if (!rows || rows.length === 0) {
    return [];
  }

  const extractedUrls: string[] = [];

  // Determine URL column index
  let urlColumnIndex = 0;
  const firstRow = rows[0];

  if (Array.isArray(firstRow)) {
    const foundIndex = firstRow.findIndex(
      (cell) => typeof cell === "string" && cell.trim().toLowerCase() === "url"
    );
    if (foundIndex !== -1) {
      urlColumnIndex = foundIndex;
    }
  }

  // Iterate rows (skip header if first row was a column name header)
  const startIndex =
    Array.isArray(firstRow) &&
    typeof firstRow[urlColumnIndex] === "string" &&
    (firstRow[urlColumnIndex] as string).trim().toLowerCase() === "url"
      ? 1
      : 0;

  for (let i = startIndex; i < rows.length; i++) {
    const row = rows[i];
    if (Array.isArray(row) && row[urlColumnIndex]) {
      const val = String(row[urlColumnIndex]).trim();
      if (val) {
        extractedUrls.push(val);
      }
    }
  }

  return extractedUrls;
}
