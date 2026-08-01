export const siteConfig = {
  name: "ThriveMap",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  description:
    "Search occupational therapy, speech therapy, early intervention, behavioral support, and developmental clinics across the Philippines.",
  contactEmail: "hello@thrivemap.ph",
} as const;
