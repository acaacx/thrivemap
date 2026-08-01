import Link from "next/link";
import { getDashboardMetrics } from "@/modules/admin/server";

export default async function AdminDashboardPage() {
  const metrics = await getDashboardMetrics();

  const tiles = [
    {
      label: "Pending submissions",
      value: metrics.submissions,
      href: "/admin/submissions",
    },
    { label: "Open claims", value: metrics.claims, href: "/admin/claims" },
    {
      label: "Change requests",
      value: metrics.changeRequests,
      href: "/admin/change-requests",
    },
    { label: "Open reports", value: metrics.reports, href: "/admin/reports" },
    {
      label: "Duplicate candidates",
      value: metrics.duplicates,
      href: "/admin/duplicates",
    },
    { label: "Published clinics", value: metrics.published, href: "/clinics" },
    { label: "Dead jobs", value: metrics.deadJobs, href: "/admin" },
  ];

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">
        Moderation dashboard
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Review queues across the directory. Every decision is recorded in the
        audit log.
      </p>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <li key={tile.label}>
            <Link
              href={tile.href}
              className="block rounded-2xl border bg-card p-5 hover:border-primary/40"
            >
              <p className="font-heading text-3xl font-semibold">
                {tile.value}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{tile.label}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
