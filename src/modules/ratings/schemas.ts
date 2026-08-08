import { z } from "zod";

const dimension = z.number().int().min(1).max(5);

export const ratingInputSchema = z.object({
  communication: dimension,
  sensoryFriendliness: dimension,
  affirmingApproach: dimension,
  scheduling: dimension,
});

export type RatingInput = z.infer<typeof ratingInputSchema>;
