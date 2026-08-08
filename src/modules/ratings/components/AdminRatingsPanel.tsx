import { Badge } from "@/components/ui/badge";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RatingRowActions } from "./RatingRowActions";

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 14;

interface RatingRow {
  id: string;
  email: string;
  communication: number;
  sensory_friendliness: number;
  affirming_approach: number;
  scheduling: number;
  created_at: string;
  updated_at: string;
  voided_at: string | null;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Not a component — plain helper, so calling Date.now() here is fine. */
function buildDailyTimeline(rows: { created_at: string }[]): {
  days: string[];
  counts: Map<string, number>;
} {
  const nowMs = Date.now();
  const cutoff = new Date(nowMs - LOOKBACK_DAYS * DAY_MS);
  const counts = new Map<string, number>();
  for (const r of rows) {
    const created = new Date(r.created_at);
    if (created < cutoff) continue;
    const key = dayKey(r.created_at);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const days = Array.from({ length: LOOKBACK_DAYS }, (_, i) =>
    dayKey(new Date(nowMs - i * DAY_MS).toISOString()),
  ).reverse();
  return { days, counts };
}

/** Moderation view for one clinic: all ratings (voided or not) + a 14-day
 * submission timeline for spotting review brigades. This page is already
 * gated by requireModerator() (admin/layout.tsx), and the select policy's
 * staff arm (public.is_moderator_or_admin()) grants exactly that — so reads
 * go through the caller's own session. The admin client is kept only for
 * auth.admin.listUsers(), which has no RLS-scoped equivalent. */
export async function AdminRatingsPanel({ clinicId }: { clinicId: string }) {
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  const { data: ratings, error } = await supabase
    .from("clinic_ratings")
    .select(
      "id, user_id, communication, sensory_friendliness, affirming_approach, scheduling, created_at, updated_at, voided_at",
    )
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Could not load ratings for this clinic.
      </p>
    );
  }

  const userIds = Array.from(
    new Set((ratings ?? []).map((r) => r.user_id)),
  );
  const emailById = new Map<string, string>();
  if (userIds.length > 0) {
    // Mirrors listUsersWithRoles' approach — no bulk get-by-ids endpoint,
    // so list once and match. Fine at admin-panel scale. Still needs the
    // admin client: auth.admin.listUsers is a service-role-only API.
    const { data: authUsers } = await admin.auth.admin.listUsers({
      perPage: 200,
    });
    for (const u of authUsers?.users ?? []) {
      if (u.email) emailById.set(u.id, u.email);
    }
  }

  const rows: RatingRow[] = (ratings ?? []).map((r) => ({
    id: r.id,
    email: emailById.get(r.user_id) ?? r.user_id,
    communication: r.communication,
    sensory_friendliness: r.sensory_friendliness,
    affirming_approach: r.affirming_approach,
    scheduling: r.scheduling,
    created_at: r.created_at,
    updated_at: r.updated_at,
    voided_at: r.voided_at,
  }));

  const { days, counts: dailyCounts } = buildDailyTimeline(rows);

  return (
    <section className="mt-8">
      <h2 className="font-heading text-lg font-semibold">Ratings</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {rows.length} rating{rows.length === 1 ? "" : "s"} total. Voiding
        removes a rating from the public average immediately; it stays
        reversible.
      </p>

      <div className="mt-4 overflow-x-auto rounded-2xl border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground">
          Submissions per day (last {LOOKBACK_DAYS} days)
        </p>
        <div className="mt-2 flex items-end gap-1">
          {days.map((day) => {
            const count = dailyCounts.get(day) ?? 0;
            return (
              <div
                key={day}
                className="flex flex-col items-center gap-1"
                title={`${day}: ${count}`}
              >
                <div
                  className="w-3 rounded-sm bg-primary/70"
                  style={{ height: `${8 + Math.min(count, 10) * 6}px` }}
                />
                <span className="text-[10px] text-muted-foreground">
                  {count > 0 ? count : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No ratings for this clinic yet.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((row) => {
            const voided = row.voided_at !== null;
            return (
              <div
                key={row.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-4"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{row.email}</p>
                    {voided && (
                      <Badge variant="destructive" className="text-xs">
                        voided
                      </Badge>
                    )}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-4">
                    <div>
                      <dt className="inline">Communication: </dt>
                      <dd className="inline font-medium text-foreground">
                        {row.communication}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline">Sensory friendliness: </dt>
                      <dd className="inline font-medium text-foreground">
                        {row.sensory_friendliness}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline">Affirming approach: </dt>
                      <dd className="inline font-medium text-foreground">
                        {row.affirming_approach}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline">Scheduling: </dt>
                      <dd className="inline font-medium text-foreground">
                        {row.scheduling}
                      </dd>
                    </div>
                  </dl>
                  <p className="text-xs text-muted-foreground">
                    Created {new Date(row.created_at).toLocaleString("en-PH")}
                    {row.updated_at !== row.created_at && (
                      <>
                        {" "}
                        · Updated{" "}
                        {new Date(row.updated_at).toLocaleString("en-PH")}
                      </>
                    )}
                  </p>
                </div>
                <RatingRowActions ratingId={row.id} voided={voided} />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
