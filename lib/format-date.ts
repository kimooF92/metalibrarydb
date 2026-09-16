/**
 * Shared utility for formatting product discovery dates.
 */

export function formatDiscoveryDate(dateInput: string | number | Date | null | undefined): string {
  if (!dateInput) return "";

  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "";

  const now = new Date();
  
  // Calculate midnight diffs for clean day comparisons
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfGiven = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfGiven.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  if (diffDays > 1 && diffDays <= 7) {
    return `${diffDays}d ago`;
  }

  // Older: e.g. "Sep 10, 2026" (or "Sep 10" if same year, but showing full year is clear)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

export function formatDiscoveryLabel(dateInput: string | number | Date | null | undefined): string {
  if (!dateInput) return "Discovery Date";

  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "Discovery Date";

  const fullDate = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const fullTime = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `Discovered: ${fullDate}, ${fullTime}`;
}
