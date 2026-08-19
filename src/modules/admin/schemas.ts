import { z } from "zod";

/**
 * Admin-only identity edits for a clinic listing: the display name, the
 * primary address line, and (optionally) the seeded city/province to assign.
 * Imported drafts arrive with raw Google names and addresses — and a
 * nearest-seeded-city guess for location — that usually need a human touch
 * before publishing.
 */
export const adminClinicIdentitySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the clinic a name.")
    .max(200, "Keep the name under 200 characters."),
  address_line1: z
    .string()
    .trim()
    .max(300, "Keep the address under 300 characters."),
  /** `ph_locations.id` (kind city/municipality) to assign as the clinic's city/province. */
  locationId: z.uuid().optional(),
});

export type AdminClinicIdentityInput = z.infer<
  typeof adminClinicIdentitySchema
>;

/** Sentinel `locationId` meaning "use the free-text city instead". */
export const OTHER_IMPORT_CITY = "other";

/**
 * Free-text city for the Places import when the seeded city list falls
 * short. Letters, spaces, apostrophes, dots and hyphens only — the value is
 * interpolated into the templated Places query, so keep it boring.
 */
export const importCityTextSchema = z
  .string()
  .transform((v) => v.trim().replaceAll(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(2, "Type a city name.")
      .max(60, "City name is too long.")
      .regex(
        /^[\p{L}\p{M}'. -]+$/u,
        "Use letters only — no digits or punctuation.",
      ),
  );

/** URL-safe slug for idempotency keys and job payloads. */
export function slugifyCity(city: string): string {
  return city
    .normalize("NFD")
    .replaceAll(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

/**
 * Free-text center name for the by-name Places lookup. Letters, digits and
 * the punctuation real business names use (& . , ' - ( ) /). Interpolated
 * into a Places text query, so anything else is rejected.
 */
export const placeLookupNameSchema = z
  .string()
  .transform((v) => v.trim().replaceAll(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(2, "Type the center's name.")
      .max(80, "Center name is too long.")
      .regex(
        /^[\p{L}\p{M}\p{N}&.,'()/ -]+$/u,
        "Use letters, digits and basic punctuation only.",
      ),
  );

/** A Places lookup hit sent back from the client to be added as a candidate. */
export const lookupPlaceSchema = z.object({
  externalId: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().max(300).nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  rawPayload: z.record(z.string(), z.unknown()),
});
