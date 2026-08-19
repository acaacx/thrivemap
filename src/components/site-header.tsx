import Link from "next/link";
import { MapPin } from "lucide-react";
import { AccountMenu } from "@/components/account-menu";
import { DisplayPreferences } from "@/components/display-preferences";
import { MobileNav, type NavLink } from "@/components/mobile-nav";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/site-config";
import { cn } from "@/lib/utils";

const navLinks: NavLink[] = [
  { href: "/clinics", label: "Find support" },
  { href: "/services", label: "Services" },
  { href: "/how-it-works", label: "How verification works" },
  { href: "/about", label: "About" },
];

const secondaryLink: NavLink = {
  href: "/suggest-clinic",
  label: "Suggest a clinic",
};

const appPrimaryLinks: NavLink[] = [
  { href: "/clinics", label: "Find support" },
  { href: "/services", label: "Services" },
  { href: "/how-it-works", label: "How verification works" },
  { href: "/about", label: "About" },
];

/** Everything that is not the search itself lives behind one menu. */
const appMenuLinks: NavLink[] = [
  { href: "/clinics", label: "Find support" },
  { href: "/services", label: "Services" },
  { href: "/how-it-works", label: "How verification works" },
  { href: "/suggest-clinic", label: "Suggest a clinic" },
  { href: "/about", label: "About" },
];

const appMenuSecondary: NavLink = {
  href: "/login",
  label: "Clinic sign in",
};

interface SiteHeaderProps {
  /**
   * `app`: compact shell header — logo, Display, account, menu — sized by
   * `--app-header-h` so the map + first result stay above the fold.
   */
  variant?: "default" | "app";
}

/**
 * Static on purpose: auth state lives in the client-side AccountMenu so
 * pages that render the header (all of them) stay eligible for ISR.
 *
 * Minimal by design — three destinations, one secondary action, display
 * preferences, account. Solid background (no blur) keeps it visually still.
 */
export function SiteHeader({ variant = "default" }: SiteHeaderProps) {
  const app = variant === "app";

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b bg-background",
        app && "h-(--app-header-h)",
      )}
    >
      <div
        className={cn(
          "mx-auto flex items-center justify-between gap-4 px-4",
          app ? "h-full max-w-none sm:px-4" : "h-16 max-w-6xl sm:px-6",
        )}
      >
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label={`${siteConfig.name} home`}
        >
          <span
            className={cn(
              "grid place-items-center rounded-lg bg-primary text-primary-foreground",
              app ? "size-8" : "size-9",
            )}
          >
            <MapPin className={app ? "size-4" : "size-5"} aria-hidden />
          </span>
          <span
            className={cn(
              "font-semibold tracking-tight",
              app ? "text-base" : "text-lg",
            )}
          >
            {siteConfig.name}
          </span>
        </Link>

        <nav
          aria-label={app ? "Primary" : "Main"}
          className={cn(
            "hidden items-center gap-1",
            app ? "xl:flex" : "md:flex",
          )}
        >
          {(app ? appPrimaryLinks : navLinks).map((link) => (
            <Button
              key={link.href}
              variant="ghost"
              render={<Link href={link.href} />}
            >
              {link.label}
            </Button>
          ))}
        </nav>

        {app ? (
          <div className="flex items-center gap-1.5">
            <DisplayPreferences />
            <AccountMenu hideSignedOut />
            <MobileNav
              links={appMenuLinks}
              secondary={appMenuSecondary}
              showDisplayPrefs={false}
              navLabel="Site"
            />
          </div>
        ) : (
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
        )}
      </div>
    </header>
  );
}
