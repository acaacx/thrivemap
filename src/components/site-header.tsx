import Link from "next/link";
import { MapPin } from "lucide-react";
import { AccountMenu } from "@/components/account-menu";
import { DisplayPreferences } from "@/components/display-preferences";
import { MobileNav, type NavLink } from "@/components/mobile-nav";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/site-config";

const navLinks: NavLink[] = [
  { href: "/clinics", label: "Find clinics" },
  { href: "/services", label: "Services" },
  { href: "/about", label: "About" },
];

const secondaryLink: NavLink = {
  href: "/suggest-clinic",
  label: "Suggest a clinic",
};

/**
 * Static on purpose: auth state lives in the client-side AccountMenu so
 * pages that render the header (all of them) stay eligible for ISR.
 *
 * Minimal by design — three destinations, one secondary action, display
 * preferences, account. Solid background (no blur) keeps it visually still.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label={`${siteConfig.name} home`}
        >
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <MapPin className="size-5" aria-hidden />
          </span>
          <span className="text-lg font-semibold tracking-tight">
            {siteConfig.name}
          </span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Button
              key={link.href}
              variant="ghost"
              render={<Link href={link.href} />}
            >
              {link.label}
            </Button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="hidden md:inline-flex"
            render={<Link href={secondaryLink.href} />}
          >
            {secondaryLink.label}
          </Button>
          <DisplayPreferences className="hidden sm:inline-flex" />
          <AccountMenu />
          <div className="md:hidden">
            <MobileNav links={navLinks} secondary={secondaryLink} />
          </div>
        </div>
      </div>
    </header>
  );
}
