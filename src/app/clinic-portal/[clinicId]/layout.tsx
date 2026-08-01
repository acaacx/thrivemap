import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Manage clinic",
  robots: { index: false },
};

const sections = [
  { segment: "profile", label: "Profile" },
  { segment: "services", label: "Services" },
  { segment: "hours", label: "Hours" },
  { segment: "images", label: "Images" },
];

export default async function ManageClinicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clinicId: string }>;
}) {
  const { clinicId } = await params;
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
          <nav aria-label="Clinic portal" className="text-sm text-muted-foreground">
            <Link className="hover:underline" href="/clinic-portal">
              ← All managed clinics
            </Link>
          </nav>
          <nav
            aria-label="Clinic sections"
            className="mt-4 flex gap-2 overflow-x-auto"
          >
            {sections.map((section) => (
              <Link
                key={section.segment}
                href={`/clinic-portal/${clinicId}/${section.segment}`}
                className="rounded-full border bg-card px-4 py-2 text-sm whitespace-nowrap hover:border-primary/40"
              >
                {section.label}
              </Link>
            ))}
          </nav>
          <div className="mt-6">{children}</div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
