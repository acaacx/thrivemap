import type { Metadata } from "next";
import { StaticPage } from "@/components/static-page";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The ground rules for using the ThriveMap directory.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <StaticPage
      title="Terms of use"
      lede="The short version: be honest, be kind, verify before you rely."
    >
      <h2>What ThriveMap provides</h2>
      <p>
        ThriveMap is a free directory of therapy and developmental-care listings
        in the Philippines. Information is contributed by the community, clinic
        representatives, and our moderation team. We work to keep it accurate,
        but details change — always confirm with the clinic before visiting or
        making decisions.
      </p>
      <h2>Not medical advice</h2>
      <p>
        Nothing on ThriveMap is medical advice, a diagnosis, or a recommendation
        of any provider. Listing a clinic does not mean it is appropriate for
        your child. Consult qualified professionals for clinical decisions.
      </p>
      <h2>Community contributions</h2>
      <ul>
        <li>Submit only information you believe is accurate.</li>
        <li>
          Don&apos;t submit content you don&apos;t have the right to share.
        </li>
        <li>
          Claims of clinic affiliation must be truthful; fraudulent claims are
          removed and may be reported.
        </li>
        <li>
          We may edit, reject, or remove any contribution to keep the directory
          accurate and safe.
        </li>
      </ul>
      <h2>Ratings</h2>
      <p>
        Signed-in caregivers can rate a clinic on a set of structured 1-5
        scores &mdash; there are no written reviews on ThriveMap. Each person
        may leave one rating per clinic, and can edit it any time. Ratings
        found to be manipulated (fake accounts, coordinated brigading, and
        similar) may be removed by our moderation team.
      </p>
      <h2>Accounts</h2>
      <p>
        You&apos;re responsible for activity on your account. We may suspend
        accounts used for spam, harassment, or fraudulent listings.
      </p>
      <h2>Liability</h2>
      <p>
        ThriveMap is provided &ldquo;as is.&rdquo; To the extent permitted by
        law, we are not liable for decisions made based on directory information
        or for the acts of listed clinics.
      </p>
    </StaticPage>
  );
}
