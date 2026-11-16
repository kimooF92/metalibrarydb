function isBinarySpreadsheet(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  // PK zip magic header (xlsx)
  if (buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04) return true;
  // OLE compound document magic header (legacy xls)
  if (buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0) return true;
  return false;
}

function parseCsvDirect(text: string): string[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const firstLine = lines[0];
  const separator = firstLine.includes(";") ? ";" : firstLine.includes("\t") ? "\t" : ",";
  const headerCols = firstLine.split(separator).map((c) => c.replace(/^["']|["']$/g, "").trim().toLowerCase());
  let urlColIndex = headerCols.findIndex((c) => c === "url" || c === "link");
  if (urlColIndex === -1) urlColIndex = 0;

  const startIdx = headerCols[urlColIndex] === "url" || headerCols[urlColIndex] === "link" ? 1 : 0;
  const extracted: string[] = [];

  for (let i = startIdx; i < lines.length; i++) {
    const cols = lines[i].split(separator);
    if (cols[urlColIndex]) {
      const val = cols[urlColIndex].replace(/^["']|["']$/g, "").trim();
      if (val && !val.toLowerCase().startsWith("http") && !val.includes(".")) continue;
      if (val) extracted.push(val);
    }
  }

  return extracted;
}

/**
 * Parses a CSV or XLSX Buffer/ArrayBuffer and extracts URLs from the first column or column named 'url'.
 * Hardened against SheetJS prototype pollution (GHSA-4r6h-8v6p-xvw6) and formula injection.
 */
export async function parseImportFile(fileBuffer: Buffer): Promise<string[]> {
  // 1. Direct safe text parsing for CSV/TSV without invoking XLSX parser
  if (!isBinarySpreadsheet(fileBuffer)) {
    const text = fileBuffer.toString("utf8");
    return parseCsvDirect(text);
  }

  // 2. Binary XLSX parsing with safe flags (no HTML rendering, no formula evaluation)
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(fileBuffer, {
    type: "buffer",
    raw: true,
    cellHTML: false,
    cellFormula: false,
  });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return [];
  }

  // Prototype pollution guard
  if (firstSheetName === "__proto__" || firstSheetName === "constructor" || firstSheetName === "prototype") {
    return [];
  }

  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) return [];

  // Parse rows as 2D array
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });

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
      if (val && !val.includes("__proto__")) {
        extractedUrls.push(val);
      }
    }
  }

  return extractedUrls;
}
