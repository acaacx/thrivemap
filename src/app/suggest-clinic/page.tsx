import type { Metadata } from "next";
import { StaticPage } from "@/components/static-page";

export const metadata: Metadata = {
  title: "Suggest a clinic",
  description:
    "Know a therapy center or developmental clinic that's missing from ThriveMap? Suggest it and help other families find care.",
  alternates: { canonical: "/suggest-clinic" },
};

export default function SuggestClinicPage() {
  return (
    <StaticPage
      title="Suggest a clinic"
      lede="Help other families by adding a clinic we haven't listed yet."
    >
      <p>
        The suggestion form is being finalized and will open with member
        accounts shortly. In the meantime, you can email us the clinic&apos;s
        name, address, and any details you know:
      </p>
      <p>
        <a href="mailto:hello@thrivemap.ph?subject=Clinic%20suggestion" className="underline underline-offset-4">
          hello@thrivemap.ph
        </a>
      </p>
      <p>
        Every suggestion is reviewed by our moderators, checked for duplicates,
        and published as an &ldquo;Unverified&rdquo; listing until the clinic
        confirms its details.
      </p>
    </StaticPage>
  );
}
