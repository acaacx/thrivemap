import type { Database } from "@/lib/database.types";

export type ListingStatus = Database["public"]["Enums"]["listing_status"];

/**
 * Clinic listing lifecycle — single source of truth for allowed status
 * transitions. Mirrored in the database by the
 * `enforce_clinic_status_transition` trigger (migration 10); keep both in
 * sync when editing.
 */
export const LISTING_TRANSITIONS: Record<ListingStatus, ListingStatus[]> = {
  draft: ["pending_review", "archived"],
  candidate: ["pending_review", "rejected", "archived"],
  pending_review: ["published_unverified", "rejected", "draft", "archived"],
  published_unverified: [
    "published_verified",
    "temporarily_closed",
    "permanently_closed",
    "suspended",
    "archived",
  ],
  published_verified: [
    "published_unverified",
    "temporarily_closed",
    "permanently_closed",
    "suspended",
    "archived",
  ],
  temporarily_closed: [
    "published_unverified",
    "published_verified",
    "permanently_closed",
    "suspended",
    "archived",
  ],
  permanently_closed: ["published_unverified", "archived"],
  suspended: ["published_unverified", "published_verified", "archived"],
  rejected: ["pending_review", "archived"],
  archived: ["draft"],
};

export function canTransition(from: ListingStatus, to: ListingStatus): boolean {
  if (from === to) return true;
  return LISTING_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Throws when the transition is not allowed. Call before any status write. */
export function assertTransition(from: ListingStatus, to: ListingStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid clinic status transition: ${from} → ${to}`);
  }
}

/** Statuses an admin can move a clinic to from its current status. */
export function nextStatuses(from: ListingStatus): ListingStatus[] {
  return LISTING_TRANSITIONS[from] ?? [];
}
