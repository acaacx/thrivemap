import { z } from "zod";
import type { NormalizedPlace } from "./types";

/** Shape of a Places API (New) place; fixtures mirror this exactly. */
const googlePlaceSchema = z.looseObject({
  id: z.string().min(1),
  displayName: z.looseObject({ text: z.string() }).optional(),
  formattedAddress: z.string().optional(),
  location: z
    .looseObject({ latitude: z.number(), longitude: z.number() })
    .optional(),
  internationalPhoneNumber: z.string().optional(),
  websiteUri: z.string().optional(),
});

export function normalizeGooglePlace(raw: unknown): NormalizedPlace | null {
  const parsed = googlePlaceSchema.safeParse(raw);
  if (!parsed.success) return null;
  const place = parsed.data;
  return {
    externalId: place.id,
    name: place.displayName?.text ?? "Unnamed place",
    address: place.formattedAddress ?? null,
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
    rawPayload: place as Record<string, unknown>,
  };
}
