import { NextRequest, NextResponse } from "next/server";
import { parseSearchParams } from "@/modules/search/schemas";
import { searchClinics } from "@/modules/clinics/queries";

export async function GET(request: NextRequest) {
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const params = parseSearchParams(raw);
  try {
    const result = await searchClinics(params);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=30, s-maxage=60" },
    });
  } catch (error) {
    console.error("search api error", error);
    return NextResponse.json(
      {
        error: {
          code: "search_failed",
          message: "Search failed. Please try again.",
        },
      },
      { status: 500 },
    );
  }
}
