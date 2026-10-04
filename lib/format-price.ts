/**
 * Unified Price and Delivery Formatting Utility
 * Handles dynamic workspace currency symbols (DT for Tunisia, DH for Morocco, etc.)
 * Strips legacy/mismatched currency suffixes and formats prices consistently.
 */

// Known currency tokens to strip when re-formatting with dynamic workspace symbol
const CURRENCY_SUFFIX_REGEX = /\s*(?:DT|TND|DH|MAD|DZD|DA|SAR|SR|AED|USD|EUR|د\.ت|دت|د\.م|درهم|د\.ج|دج|ر\.س|رس|د\.إ)\s*$/i;
const ARABIC_PREFIX_REGEX = /^(?:د\.ت|دت|د\.م|درهم|د\.ج|ر\.س|د\.إ)\s*/i;

/**
 * Formats a raw price string or number with the active workspace's currency symbol.
 *
 * Examples:
 * - formatPrice("249 DT", "DH") => "249 DH"
 * - formatPrice("249", "DH") => "249 DH"
 * - formatPrice("2536 MAD", "DH") => "2536 DH"
 * - formatPrice("16.000 DT", "DT") => "16.000 DT"
 * - formatPrice(null, "DH") => ""
 */
export function formatPrice(
  price: string | number | null | undefined,
  currencySymbol: string = "DT"
): string {
  if (price === null || price === undefined) return "";

  const trimmed = String(price).trim();
  if (!trimmed || trimmed === "—" || trimmed === "-" || trimmed.toLowerCase() === "n/a") {
    return "";
  }

  // Preserve explicit Western currencies like $29.99 or €19.99 if they don't have local tokens
  if (/^[\$€£]/.test(trimmed) && !CURRENCY_SUFFIX_REGEX.test(trimmed)) {
    return trimmed;
  }

  // Strip legacy / mismatched currency token from end or beginning
  let cleanValue = trimmed
    .replace(CURRENCY_SUFFIX_REGEX, "")
    .replace(ARABIC_PREFIX_REGEX, "")
    .trim();

  // If after stripping it's empty, return original trimmed
  if (!cleanValue) {
    return trimmed;
  }

  const sym = currencySymbol?.trim() || "DT";
  return `${cleanValue} ${sym}`;
}

/**
 * Strips any currency symbol to return just the clean numeric value for inputs/calculations.
 *
 * Example:
 * - extractNumericPrice("249 DT") => "249"
 * - extractNumericPrice("2536 MAD") => "2536"
 */
export function extractNumericPrice(price: string | number | null | undefined): string {
  if (price === null || price === undefined) return "";
  const trimmed = String(price).trim();
  return trimmed
    .replace(CURRENCY_SUFFIX_REGEX, "")
    .replace(ARABIC_PREFIX_REGEX, "")
    .replace(/^[^\d]+/, "")
    .trim();
}

/**
 * Formats a delivery policy string with the active workspace's currency symbol.
 *
 * Examples:
 * - formatDelivery("Livraison: 7 DT", "DH") => "Livraison: 7 DH"
 * - formatDelivery("Livraison: 7 DT (Gratuite dès 2 pcs)", "DH") => "Livraison: 7 DH (Gratuite dès 2 pcs)"
 * - formatDelivery("Livraison Gratuite", "DH") => "Livraison Gratuite"
 * - formatDelivery("7 DT", "DH") => "Livraison: 7 DH"
 */
export function formatDelivery(
  delivery: string | null | undefined,
  currencySymbol: string = "DT"
): string {
  if (!delivery) return "";
  const trimmed = delivery.trim();
  if (!trimmed) return "";

  const sym = currencySymbol?.trim() || "DT";

  // Check if it's conditional free (e.g. "Livraison: 7 DT (Gratuite dès 2 pcs)")
  const hasConditionalNote =
    /\((?:gratuite|free|مجاني)[^\)]*\)/i.test(trimmed) ||
    /dès|à partir de|عند شراء/i.test(trimmed);

  const lower = trimmed.toLowerCase();
  const isPureFree =
    !hasConditionalNote &&
    (lower.includes("gratuit") ||
      lower.includes("free") ||
      lower.includes("مجاني") ||
      lower.includes("0 dt") ||
      lower.includes("0 dh") ||
      lower.includes("0dh") ||
      lower.includes("0dt") ||
      lower.includes("بلاش"));

  if (isPureFree) {
    return "Livraison Gratuite";
  }

  // Replace any DT/TND/MAD/DH with the dynamic symbol
  let replaced = trimmed.replace(/\b(?:DT|TND|MAD|DH|د\.ت|دت|د\.م|درهم)\b/gi, sym);

  // If it's just "7 DH" without "Livraison: ", prefix it nicely
  if (!replaced.toLowerCase().startsWith("livraison") && !replaced.toLowerCase().startsWith("توصيل")) {
    replaced = `Livraison: ${replaced}`;
  }

  return replaced;
}
