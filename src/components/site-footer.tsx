import Link from "next/link";
import { siteConfig } from "@/lib/site-config";

const footerColumns = [
  {
    heading: "Explore",
    links: [
      { href: "/clinics", label: "Find clinics" },
      { href: "/services/speech-therapy", label: "Speech therapy" },
      { href: "/services/occupational-therapy", label: "Occupational therapy" },
      { href: "/locations/metro-manila", label: "Metro Manila" },
    ],
  },
  {
    heading: "Contribute",
    links: [
      { href: "/suggest-clinic", label: "Suggest a clinic" },
      { href: "/how-it-works", label: "How verification works" },
    ],
  },
  {
    heading: "About",
    links: [
      { href: "/about", label: "About ThriveMap" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t bg-secondary/40">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div className="space-y-3">
          <p className="font-heading text-lg font-semibold">
            {siteConfig.name}
          </p>
          <p className="max-w-xs text-sm text-muted-foreground">
            A community directory of therapy and developmental-care centers
            across the Philippines. Built with neurodiversity-affirming care.
          </p>
          <p className="text-sm text-muted-foreground">
            <a
              className="underline-offset-4 hover:underline"
              href={`mailto:${siteConfig.contactEmail}`}
            >
              {siteConfig.contactEmail}
            </a>
          </p>
        </div>
        {footerColumns.map((col) => (
          <nav key={col.heading} aria-label={col.heading} className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {col.heading}
            </p>
            <ul className="space-y-2">
              {col.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-foreground/80 underline-offset-4 hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t py-6">
        <p className="mx-auto max-w-6xl px-4 text-xs text-muted-foreground sm:px-6">
          ThriveMap lists clinic information for discovery only and does not
          provide medical advice or recommend specific providers. Listing
          details may change — please confirm directly with each clinic.
        </p>
      </div>
    </footer>
  );
}
