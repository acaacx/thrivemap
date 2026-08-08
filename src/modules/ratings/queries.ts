import {
  createSupabaseAnonClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import type { RatingInput } from "./schemas";

export interface RatingStats {
  ratingCount: number;
  avgCommunication: number;
  avgSensoryFriendliness: number;
  avgAffirmingApproach: number;
  avgScheduling: number;
}

export type OwnRating = RatingInput & { voided: boolean };

/**
 * Public aggregate stats for a clinic. Uses the cookie-free anon client
 * (same as getClinicBySlug) so this can be called from the server-rendered
 * /clinics/[slug] page without pulling cookies() into that render — doing
 * so would opt the whole ISR'd route into per-request dynamic rendering.
 */
export async function getRatingStats(
  clinicId: string,
): Promise<RatingStats | null> {
  const supabase = createSupabaseAnonClient();
  const { data: statsRow } = await supabase
    .from("clinic_rating_stats")
    .select(
      "rating_count, avg_communication, avg_sensory_friendliness, avg_affirming_approach, avg_scheduling",
    )
    .eq("clinic_id", clinicId)
    .maybeSingle();

  return statsRow
    ? {
        ratingCount: statsRow.rating_count,
        avgCommunication: Number(statsRow.avg_communication),
        avgSensoryFriendliness: Number(statsRow.avg_sensory_friendliness),
        avgAffirmingApproach: Number(statsRow.avg_affirming_approach),
        avgScheduling: Number(statsRow.avg_scheduling),
      }
    : null;
}

/**
 * The caller's own rating for a clinic. Cookie-scoped (RLS-gated to the
 * signed-in user), so only ever call this from a request-time context —
 * a route handler or server action — never from the ISR'd clinic page's
 * own render. See src/app/api/ratings/own/route.ts.
 */
export async function getOwnRating(
  clinicId: string,
  userId: string,
): Promise<OwnRating | null> {
  const supabase = await createSupabaseServerClient();
  const { data: ownRow } = await supabase
    .from("clinic_ratings")
    .select(
      "communication, sensory_friendliness, affirming_approach, scheduling, voided_at",
    )
    .eq("clinic_id", clinicId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!ownRow) return null;
  return {
    communication: ownRow.communication,
    sensoryFriendliness: ownRow.sensory_friendliness,
    affirmingApproach: ownRow.affirming_approach,
    scheduling: ownRow.scheduling,
    voided: ownRow.voided_at !== null,
  };
}
