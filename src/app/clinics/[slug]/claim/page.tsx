import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/modules/auth/server";
import { getClinicBySlug } from "@/modules/clinics/queries";
import { ClaimWizard } from "@/modules/claims/components/ClaimWizard";
import { getOwnClaimForClinic } from "@/modules/claims/queries";

export const metadata: Metadata = {
  title: "Claim this clinic",
  robots: { index: false },
};

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const clinic = await getClinicBySlug(slug);
  if (!clinic) notFound();

  const user = await getCurrentUser();
  const claim = user ? await getOwnClaimForClinic(clinic.id, user.id) : null;
  const claimedByOther =
    Boolean(clinic.claimed_by) && clinic.claimed_by !== user?.id;

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
          <h1 className="font-heading text-3xl font-semibold">
            Claim {clinic.name}
          </h1>
          <p className="mt-3 text-muted-foreground">
            Clinic representatives can claim this listing to keep services,
            hours, and contact details accurate — and earn a Verified badge.
          </p>

          {claimedByOther && !claim && (
            <div className="mt-6 rounded-xl border border-border bg-secondary p-4 text-sm">
              <p className="font-medium">
                This listing already has a representative.
              </p>
              <p className="mt-1 text-muted-foreground">
                If you believe this is a mistake, or you also represent this
                clinic, email{" "}
                <a className="underline" href="mailto:hello@thrivemap.ph">
                  hello@thrivemap.ph
                </a>{" "}
                and our team will help.
              </p>
            </div>
          )}

          <div className="mt-8">
            {user ? (
              <ClaimWizard
                clinic={{ id: clinic.id, name: clinic.name, slug: clinic.slug }}
                userId={user.id}
                initialClaim={claim}
              />
            ) : (
              <div className="rounded-2xl border bg-card p-6 text-sm">
                <p className="font-medium">Sign in to start your claim</p>
                <p className="mt-1 text-muted-foreground">
                  You&apos;ll need an account so we can keep you updated and,
                  once approved, give you access to the clinic portal.
                </p>
                <div className="mt-4 flex gap-3">
                  <Button
                    render={
                      <Link
                        href={`/login?next=${encodeURIComponent(`/clinics/${clinic.slug}/claim`)}`}
                      />
                    }
                  >
                    Sign in
                  </Button>
                  <Button
                    variant="outline"
                    render={
                      <Link
                        href={`/signup?next=${encodeURIComponent(`/clinics/${clinic.slug}/claim`)}`}
                      />
                    }
                  >
                    Create account
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
