import type { Metadata } from "next";
import { StaticPage } from "@/components/static-page";

export const metadata: Metadata = {
  title: "About",
  description:
    "ThriveMap is a Philippines-first directory helping families find therapy centers and developmental clinics, built with neurodiversity-affirming values.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <StaticPage
      title="About ThriveMap"
      lede="Helping Filipino families find developmental care, one map pin at a time."
    >
      <p>
        ThriveMap is a community directory of therapy centers, developmental
        clinics, and child-development services across the Philippines. We help
        parents and caregivers discover options near them — occupational
        therapy, speech and language therapy, early intervention, behavioral
        support, developmental assessment, and more.
      </p>
      <h2>What we believe</h2>
      <ul>
        <li>
          Autism and other developmental differences are part of human
          diversity. We use neurodiversity-affirming language and never frame
          autism as something to be cured.
        </li>
        <li>
          Families deserve clear, accurate information. Every listing shows its
          verification status, and our moderators review every community
          contribution.
        </li>
        <li>
          Finding care should be free and pressure-free. Searching never
          requires an account, and we don&apos;t rank clinics as
          &ldquo;best&rdquo; — we show you what&apos;s available and let you
          decide.
        </li>
      </ul>
      <h2>What ThriveMap is not</h2>
      <p>
        ThriveMap is a directory, not a medical service. We don&apos;t provide
        diagnoses, recommendations, or medical advice, and we don&apos;t store
        health records. Whether a service fits your child is a decision for
        your family, ideally together with your care team.
      </p>
      <h2>Get in touch</h2>
      <p>
        Questions, corrections, partnership ideas? Email{" "}
        <a href="mailto:hello@thrivemap.ph" className="underline underline-offset-4">
          hello@thrivemap.ph
        </a>
        .
      </p>
    </StaticPage>
  );
}
