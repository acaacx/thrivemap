import type { Metadata } from "next";
import { StaticPage } from "@/components/static-page";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How ThriveMap handles your data, in plain language.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <StaticPage
      title="Privacy"
      lede="Plain-language summary of what we collect and why."
    >
      <p>
        ThriveMap is designed to work with as little personal information as
        possible. This page summarizes our practices; it will be reviewed for
        compliance with the Philippine Data Privacy Act of 2012 (RA 10173)
        before public launch.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Searching without an account:</strong> nothing personal. If
          you use &ldquo;Use my location,&rdquo; your browser shares your
          position once to center the map — we do not store it.
        </li>
        <li>
          <strong>With an account:</strong> your email address, display name,
          and the things you choose to save (favorites, suggestions, reports).
        </li>
        <li>
          <strong>Clinic claims:</strong> contact details and affiliation
          documents, stored privately and visible only to authorized reviewers.
        </li>
      </ul>
      <h2>What we never collect</h2>
      <ul>
        <li>Diagnoses or medical records</li>
        <li>Therapy notes or clinical histories</li>
        <li>Information about your child&apos;s development</li>
      </ul>
      <h2>Analytics</h2>
      <p>
        We use privacy-conscious product analytics to understand which features
        help families (for example, how often searches lead to clinic pages).
        Analytics never include your precise location or any health information.
      </p>
      <h2>Your choices</h2>
      <p>
        You can use ThriveMap fully without an account. Account holders can
        request deletion of their data at any time by emailing{" "}
        <a
          href="mailto:hello@thrivemap.ph"
          className="underline underline-offset-4"
        >
          hello@thrivemap.ph
        </a>
        .
      </p>
    </StaticPage>
  );
}
