/**
 * Pure, zero-dependency CSV formatting and serialization engine.
 * Safe for use in client components, server routes, workers, and background jobs.
 *
 * Implements:
 * 1. RFC 4180 escaping (double quotes doubled, commas, multiline text, CRLF line endings).
 * 2. Type-aware formula injection prevention (CWE-1236):
 *    - Numeric primitives (including negative numbers e.g. -5, -42.5) are preserved as raw numbers.
 *    - String values beginning with dangerous formula triggers (=, +, -, @, \t, \r) are sanitized by prepending a single quote (').
 * 3. Excel UTF-8 BOM (\uFEFF) support ensuring Arabic Darija, accents, and UTF-8 glyphs display without mojibake.
 */

/**
 * Formats a single cell value into an RFC 4180 compliant CSV field.
 */
export function formatCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  // Legitimate numbers (including negative numbers like -5, -12.5) are preserved
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  let str: string;
  if (typeof value === "string") {
    str = value;
  } else if (typeof value === "object") {
    try {
      str = JSON.stringify(value);
    } catch {
      str = String(value);
    }
  } else {
    str = String(value);
  }

  // Type-Aware Formula Injection Prevention (CWE-1236)
  // Check if string begins with execution symbols even after leading whitespace
  const trimmed = str.trimStart();
  const isFormula =
    trimmed.length > 0 &&
    (trimmed.startsWith("=") ||
      trimmed.startsWith("+") ||
      trimmed.startsWith("-") ||
      trimmed.startsWith("@") ||
      trimmed.startsWith("\t") ||
      trimmed.startsWith("\r"));

  if (isFormula) {
    str = `'${str}`;
  }

  // RFC 4180: If string contains double quotes, commas, newlines, carriage returns,
  // or was prepended with a quote for formula defense, enclose in quotes and escape internal quotes.
  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r") ||
    isFormula
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Serializes a dataset (headers + rows) into an RFC 4180 compliant CSV string with UTF-8 BOM.
 */
export function serializeToCsv(
  headers: string[],
  rows: (unknown)[][]
): string {
  const headerLine = headers.map(formatCsvCell).join(",");
  const rowLines = rows.map((row) => row.map(formatCsvCell).join(","));

  const allLines = [headerLine, ...rowLines];
  // Prepend UTF-8 BOM (\uFEFF) for Microsoft Excel compatibility with Arabic Darija & UTF-8
  return "\uFEFF" + allLines.join("\r\n");
}

/**
 * Triggers a browser file download for a CSV string using Blob and ObjectURL.
 * Safe to call only in browser contexts.
 */
export function downloadCsvInBrowser(filename: string, csvContent: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
