import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Whether the caller is signed in. Lets client components (e.g. InquiryCta
 * on the clinic profile page) resolve auth state without the page itself
 * calling getCurrentUser() — that would force dynamic rendering and kill
 * ISR on the highest-traffic route. Mirrors /api/favorites.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return NextResponse.json({ signedIn: Boolean(user) });
}
