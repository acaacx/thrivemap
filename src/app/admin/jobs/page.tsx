import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { retryDeadJob, runJobsTickAction } from "@/modules/admin/actions";
import { countStaleClinics, listJobs } from "@/modules/admin/server";

export const dynamic = "force-dynamic";

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString("en-PH") : "—";
}

export default async function AdminJobsPage() {
  const [jobs, staleClinics] = await Promise.all([
    listJobs(),
    countStaleClinics(),
  ]);
  const dead = jobs.filter((j) => j.status === "dead");
  const rest = jobs.filter((j) => j.status !== "dead");

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">
            Background jobs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Queue health and the dead-letter list. Retried jobs run on the next
            tick.
          </p>
        </div>
        <form
          className="ml-auto"
          action={async () => {
            "use server";
            await runJobsTickAction();
          }}
        >
          <Button type="submit" variant="outline">
            Run tick now
          </Button>
        </form>
      </div>

      {staleClinics > 0 && (
        <p className="mt-4 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm dark:bg-amber-950/30">
          {staleClinics} published listing(s) flagged stale (no updates in over
          a year). They keep the flag until their next edit or verification.
        </p>
      )}

      <h2 className="mt-8 font-heading text-lg font-semibold">
        Dead letter ({dead.length})
      </h2>
      {dead.length === 0 ? (
        <p className="mt-3 rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          No dead jobs — every queued job has completed or is still retrying.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {dead.map((job) => (
            <li key={job.id} className="rounded-2xl border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{job.job_type}</span>
                <Badge variant="destructive">dead</Badge>
                <span className="text-xs text-muted-foreground">
                  {job.attempts}/{job.max_attempts} attempts · created{" "}
                  {formatDate(job.created_at)}
                </span>
                <form
                  className="ml-auto"
                  action={async () => {
                    "use server";
                    await retryDeadJob(job.id);
                  }}
                >
                  <Button type="submit" size="sm" variant="outline">
                    Retry
                  </Button>
                </form>
              </div>
              {job.last_error && (
                <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                  {job.last_error}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-8 font-heading text-lg font-semibold">Recent jobs</h2>
      <div className="mt-3 overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Attempts</th>
              <th className="px-4 py-2.5 font-medium">Run at</th>
              <th className="px-4 py-2.5 font-medium">Last error</th>
            </tr>
          </thead>
          <tbody>
            {rest.slice(0, 50).map((job) => (
              <tr key={job.id} className="border-b last:border-0">
                <td className="px-4 py-2">{job.job_type}</td>
                <td className="px-4 py-2">
                  <Badge
                    variant={
                      job.status === "completed" ? "secondary" : "outline"
                    }
                  >
                    {job.status}
                  </Badge>
                </td>
                <td className="px-4 py-2">{job.attempts}</td>
                <td className="px-4 py-2">{formatDate(job.run_at)}</td>
                <td className="max-w-64 truncate px-4 py-2 font-mono text-xs text-muted-foreground">
                  {job.last_error ?? "—"}
                </td>
              </tr>
            ))}
            {rest.length === 0 && (
              <tr>
                <td
                  className="px-4 py-6 text-center text-muted-foreground"
                  colSpan={5}
                >
                  No jobs queued yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
