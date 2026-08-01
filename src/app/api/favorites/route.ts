import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Current user's favorited clinic ids (RLS scopes to owner). */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ clinicIds: [], signedIn: false });
  const { data } = await supabase.from("favorites").select("clinic_id");
  return NextResponse.json({
    clinicIds: (data ?? []).map((f) => f.clinic_id),
    signedIn: true,
  });
}
