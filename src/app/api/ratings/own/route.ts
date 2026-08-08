import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOwnRating } from "@/modules/ratings/queries";

const clinicIdSchema = z.uuid();

/**
 * Viewer-specific ratings state for one clinic: signed-in?, do they manage
 * it (managers can't rate their own clinic), and their own rating if any.
 * Lets RatingsViewerPanel (client component) resolve this without the
 * server-rendered clinic page calling cookies() itself — that would opt
 * /clinics/[slug] out of ISR. Mirrors /api/favorites and
 * /api/inquiries/session.
 */
export async function GET(request: NextRequest) {
  const parsed = clinicIdSchema.safeParse(
    request.nextUrl.searchParams.get("clinicId"),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid clinic." }, { status: 400 });
  }
  const clinicId = parsed.data;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ signedIn: false, isManager: false, own: null });
  }

  const [own, { data: grant }] = await Promise.all([
    getOwnRating(clinicId, user.id),
    supabase
      .from("clinic_managers")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    signedIn: true,
    isManager: grant !== null,
    own,
  });
}
