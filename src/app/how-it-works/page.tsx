import type { Metadata } from "next";
import { StaticPage } from "@/components/static-page";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "How ThriveMap listings are created, reviewed, and verified — and how clinic representatives can claim their profile.",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorksPage() {
  return (
    <StaticPage
      title="How ThriveMap works"
      lede="Every listing goes through the same open, reviewable journey."
    >
      <h2>1. A clinic gets listed</h2>
      <p>
        Listings start from community suggestions, clinic sign-ups, or reviewed
        external sources. New listings are checked by our moderators for
        duplicates and completeness before they appear publicly as
        &ldquo;Unverified.&rdquo;
      </p>
      <h2>2. The community keeps it honest</h2>
      <p>
        Anyone can report incorrect information — wrong hours, moved locations,
        closed clinics. Registered users can also suggest corrections. Reports
        go straight to the moderation queue.
      </p>
      <h2>3. Clinics claim their profile</h2>
      <p>
        Clinic representatives can claim a listing by submitting proof of
        affiliation. Approved representatives manage their clinic&apos;s
        details, services, photos, and opening hours — and the listing earns a
        &ldquo;Verified&rdquo; badge.
      </p>
      <h2>What the badges mean</h2>
      <ul>
        <li>
          <strong>Verified</strong> — details confirmed by the clinic or by
          ThriveMap moderators.
        </li>
        <li>
          <strong>Unverified</strong> — community-contributed information that
          hasn&apos;t been confirmed yet. It may be incomplete or outdated.
        </li>
        <li>
          <strong>Temporarily closed</strong> — the clinic has paused services
          but is expected to reopen.
        </li>
      </ul>
      <h2>Claiming your clinic</h2>
      <p>
        Find your clinic&apos;s page and select &ldquo;Claim this clinic.&rdquo;
        You&apos;ll need a work email, your role at the clinic, and a document
        showing your affiliation (for example, a business permit or employment
        record). Claims are reviewed by our team; documents stay private and are
        never shown publicly.
      </p>
    </StaticPage>
  );
}
