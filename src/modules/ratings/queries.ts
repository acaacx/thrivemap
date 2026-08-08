import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { RatingInput } from "./schemas";

export interface RatingStats {
  ratingCount: number;
  avgCommunication: number;
  avgSensoryFriendliness: number;
  avgAffirmingApproach: number;
  avgScheduling: number;
}

export type OwnRating = RatingInput & { voided: boolean };

export async function getRatingContext(
  clinicId: string,
  userId: string | null,
): Promise<{ stats: RatingStats | null; own: OwnRating | null }> {
  const supabase = await createSupabaseServerClient();

  const { data: statsRow } = await supabase
    .from("clinic_rating_stats")
    .select(
      "rating_count, avg_communication, avg_sensory_friendliness, avg_affirming_approach, avg_scheduling",
    )
    .eq("clinic_id", clinicId)
    .maybeSingle();

  let own: OwnRating | null = null;
  if (userId) {
    const { data: ownRow } = await supabase
      .from("clinic_ratings")
      .select(
        "communication, sensory_friendliness, affirming_approach, scheduling, voided_at",
      )
      .eq("clinic_id", clinicId)
      .eq("user_id", userId)
      .maybeSingle();
    if (ownRow) {
      own = {
        communication: ownRow.communication,
        sensoryFriendliness: ownRow.sensory_friendliness,
        affirmingApproach: ownRow.affirming_approach,
        scheduling: ownRow.scheduling,
        voided: ownRow.voided_at !== null,
      };
    }
  }

  return {
    stats: statsRow
      ? {
          ratingCount: statsRow.rating_count,
          avgCommunication: Number(statsRow.avg_communication),
          avgSensoryFriendliness: Number(statsRow.avg_sensory_friendliness),
          avgAffirmingApproach: Number(statsRow.avg_affirming_approach),
          avgScheduling: Number(statsRow.avg_scheduling),
        }
      : null,
    own,
  };
}
