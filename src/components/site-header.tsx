import Link from "next/link";
import { MapPin } from "lucide-react";
import { AccountMenu } from "@/components/account-menu";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/site-config";

const navLinks = [
  { href: "/clinics", label: "Find clinics" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/suggest-clinic", label: "Suggest a clinic" },
];

/**
 * Static on purpose: auth state lives in the client-side AccountMenu so
 * pages that render the header (all of them) stay eligible for ISR.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2"
          aria-label={`${siteConfig.name} home`}
        >
          <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground">
            <MapPin className="size-5" aria-hidden />
          </span>
          <span className="font-heading text-xl font-semibold tracking-tight">
            {siteConfig.name}
          </span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
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
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
