import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMapProvider } from "@/modules/maps";
import { cachedClinicData } from "@/modules/shared/cache";

const querySchema = z.object({
  q: z.string().trim().min(2).max(120).optional(),
  placeId: z.string().max(200).optional(),
});

/** Location autocomplete (?q=) and place geocoding (?placeId=). */
export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success || (!parsed.data.q && !parsed.data.placeId)) {
    return NextResponse.json(
      { error: { code: "invalid_query", message: "Provide q or placeId." } },
      { status: 400 },
    );
  }
  const provider = getMapProvider();
  try {
    if (parsed.data.placeId) {
      const location = await provider.geocodePlace(parsed.data.placeId);
      return NextResponse.json({ location });
    }
    const query = parsed.data.q!.toLowerCase();
    const suggestions = await cachedClinicData(
      `autocomplete|${query}`,
      3600,
      () => provider.autocompleteLocation(query),
    );
    return NextResponse.json(
      { suggestions },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } },
    );
  } catch (error) {
    console.error("locations api error", error);
    return NextResponse.json(
      {
        error: { code: "locations_failed", message: "Location lookup failed." },
      },
      { status: 500 },
    );
  }
}
