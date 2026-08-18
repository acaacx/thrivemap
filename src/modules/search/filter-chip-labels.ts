/** Labels for the primary filter chip row — pure so they can be unit-tested. */

export interface ServiceOption {
  slug: string;
  name: string;
}

/** "Service" | "Occupational Therapy" | "Occupational Therapy +2". */
export function formatServiceChip(
  selected: string[],
  options: ServiceOption[],
): string {
  if (selected.length === 0) return "Service";
  const first =
    options.find((o) => o.slug === selected[0])?.name ?? selected[0];
  return selected.length === 1 ? first : `${first} +${selected.length - 1}`;
}

/** "Age group" | "Age group · 2". */
export function formatCountChip(label: string, count: number): string {
  return count > 0 ? `${label} · ${count}` : label;
}

/** "Within 10 km". */
export function formatDistanceChip(radiusKm: number): string {
  return `Within ${radiusKm} km`;
}
