import type { RatingStats } from "../queries";

const DIMENSIONS: Array<{ key: keyof RatingStats; label: string }> = [
  { key: "avgCommunication", label: "Communication & responsiveness" },
  { key: "avgSensoryFriendliness", label: "Sensory-friendliness" },
  { key: "avgAffirmingApproach", label: "Neurodiversity-affirming approach" },
  { key: "avgScheduling", label: "Scheduling & waiting time" },
];

/** Server component — renders aggregate rating stats for a clinic. */
export function RatingSummary({ stats }: { stats: RatingStats | null }) {
  return (
    <div className="space-y-4">
      {stats === null ? (
        <p className="text-sm text-muted-foreground">No ratings yet.</p>
      ) : stats.ratingCount < 3 ? (
        <p className="text-sm text-muted-foreground">
          This clinic has ratings, but not enough yet to show averages.
        </p>
      ) : (
        <div className="space-y-3">
          {DIMENSIONS.map(({ key, label }) => {
            const avg = stats[key];
            return (
              <div key={key} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-4 text-sm">
                  <span>{label}</span>
                  <span className="font-medium tabular-nums">
                    {avg.toFixed(1)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(avg / 5) * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
          <p className="text-sm text-muted-foreground">
            Based on {stats.ratingCount} ratings
          </p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Ratings are structured scores from signed-in caregivers. ThriveMap
        does not host written reviews.
      </p>
    </div>
  );
}
