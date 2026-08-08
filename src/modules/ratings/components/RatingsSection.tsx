import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/modules/auth/server";
import { getRatingContext } from "../queries";
import { RatingForm } from "./RatingForm";
import { RatingSummary } from "./RatingSummary";

/**
 * Server component — resolves the viewer and manager state itself so the
 * clinic page doesn't need to plumb them through.
 */
export async function RatingsSection({
  clinicId,
  slug,
}: {
  clinicId: string;
  slug: string;
}) {
  const user = await getCurrentUser();
  const { stats, own } = await getRatingContext(clinicId, user?.id ?? null);

  let isManager = false;
  if (user) {
    const supabase = await createSupabaseServerClient();
    const { data: grant } = await supabase
      .from("clinic_managers")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .maybeSingle();
    isManager = grant !== null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">
          <h2>Caregiver ratings</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <RatingSummary stats={stats} />
        {!user ? (
          <p className="text-sm text-muted-foreground">
            <Link
              href={`/login?next=${encodeURIComponent(`/clinics/${slug}`)}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Sign in
            </Link>{" "}
            to rate this clinic.
          </p>
        ) : isManager ? null : (
          <RatingForm clinicId={clinicId} slug={slug} own={own} />
        )}
      </CardContent>
    </Card>
  );
}
