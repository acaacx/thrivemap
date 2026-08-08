import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { requireModerator } from "@/modules/admin/server";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false },
};

const adminNav = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/clinics", label: "Clinics" },
  { href: "/admin/submissions", label: "Submissions" },
  { href: "/admin/claims", label: "Claims" },
  { href: "/admin/change-requests", label: "Change requests" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/candidates", label: "Candidates" },
  { href: "/admin/duplicates", label: "Duplicates" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/audit", label: "Audit log" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireModerator();

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[190px_1fr]">
          <nav
            aria-label="Admin"
            className="flex gap-2 overflow-x-auto md:flex-col"
          >
            {adminNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full border bg-card px-4 py-2 text-sm whitespace-nowrap hover:border-primary/40 md:rounded-lg"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="min-w-0">{children}</div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
