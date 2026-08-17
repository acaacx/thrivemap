import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/modules/auth/server";
import { getServices } from "@/modules/clinics/queries";
import { SuggestClinicForm } from "@/modules/submissions/components/SuggestClinicForm";

export const metadata: Metadata = {
  title: "Suggest a clinic",
  description:
    "Know a therapy center or developmental clinic that's missing from ThriveMap? Suggest it and help other families find care.",
  alternates: { canonical: "/suggest-clinic" },
};

export default async function SuggestClinicPage() {
  const [services, user] = await Promise.all([getServices(), getCurrentUser()]);

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <div className="border-b bg-secondary">
          <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Suggest a clinic
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              Help other families by adding a clinic we haven&apos;t listed.
              Every suggestion is reviewed by our moderators before it appears.
            </p>
          </div>
        </div>
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <SuggestClinicForm
            services={services.map((s) => ({ slug: s.slug, name: s.name }))}
            defaultEmail={user?.email ?? undefined}
          />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
