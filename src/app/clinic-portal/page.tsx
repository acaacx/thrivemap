import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getManagedClinics } from "@/modules/portal/server";
import { VerificationBadge } from "@/modules/clinics/components/VerificationBadge";

export const metadata: Metadata = {
  title: "Clinic portal",
  robots: { index: false },
};

export default async function ClinicPortalPage() {
  const clinics = await getManagedClinics();

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
          <h1 className="font-heading text-3xl font-semibold">Clinic portal</h1>
          <p className="mt-2 text-muted-foreground">
            Manage the listings you represent — keep services, hours, and contact
            details accurate for families.
          </p>

          {clinics.length === 0 ? (
            <div className="mt-10 rounded-2xl border bg-card p-8 text-center">
              <p className="font-heading text-lg font-semibold">
                No managed clinics yet
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Claim your clinic from its listing page. Once a moderator approves
                your claim, it appears here.
              </p>
              <Button className="mt-6 rounded-full" render={<Link href="/clinics" />}>
                Find your clinic
              </Button>
            </div>
          ) : (
            <ul className="mt-8 space-y-4">
              {clinics.map((clinic) => (
                <li
                  key={clinic.id}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-heading text-lg font-semibold">
                      {clinic.name}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      {clinic.status === "published_verified" ? (
                        <VerificationBadge status={clinic.status} />
                      ) : (
                        <Badge variant="outline">
                          {clinic.status.replaceAll("_", " ")}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="ml-auto flex gap-2">
                    <Button
                      variant="outline"
                      className="rounded-full"
                      render={<Link href={`/clinics/${clinic.slug}`} />}
                    >
                      View listing
                    </Button>
                    <Button
                      className="rounded-full"
                      render={<Link href={`/clinic-portal/${clinic.id}/profile`} />}
                    >
                      Manage
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
