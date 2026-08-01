/** Formats a distance in kilometers for display. */
export function formatDistanceKm(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km)) return null;
  if (km < 0.1) return "less than 100 m";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function dayName(dayOfWeek: number): string {
  return DAY_NAMES[dayOfWeek] ?? "";
}

/** "08:00:00" → "8:00 AM" */
export function formatTime(time: string | null | undefined): string {
  if (!time) return "";
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${mStr} ${suffix}`;
}

export function statusLabel(status: string): string {
  switch (status) {
    case "published_verified":
      return "Verified";
    case "published_unverified":
      return "Unverified";
    case "temporarily_closed":
      return "Temporarily closed";
    case "permanently_closed":
      return "Permanently closed";
    default:
      return status.replaceAll("_", " ");
  }
}

export function slugToTitle(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
