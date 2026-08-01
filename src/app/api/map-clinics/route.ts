import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMapClinics } from "@/modules/clinics/queries";

const boundsSchema = z.object({
  north: z.coerce.number().min(-90).max(90),
  south: z.coerce.number().min(-90).max(90),
  east: z.coerce.number().min(-180).max(180),
  west: z.coerce.number().min(-180).max(180),
  services: z.string().optional(),
  verified: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const parsed = boundsSchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_bounds", message: "Invalid map bounds." } },
      { status: 400 },
    );
  }
  const { north, south, east, west, services, verified } = parsed.data;
  try {
    const clinics = await getMapClinics({
      north,
      south,
      east,
      west,
      services: services?.split(",").filter(Boolean),
      verifiedOnly: verified === "1",
    });
    return NextResponse.json(
      { clinics },
      { headers: { "Cache-Control": "public, max-age=30, s-maxage=60" } },
    );
  } catch (error) {
    console.error("map-clinics api error", error);
    return NextResponse.json(
      { error: { code: "map_failed", message: "Could not load map clinics." } },
      { status: 500 },
    );
  }
}
