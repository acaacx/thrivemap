"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DisplayPreferences } from "@/components/display-preferences";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export interface NavLink {
  href: string;
  label: string;
}

/**
 * Small-screen navigation. One labelled "Menu" button opens a sheet with
 * the same links as the desktop nav plus the secondary "Suggest a clinic"
 * action — no icon-only controls, no hidden meanings.
 */
export function MobileNav({
  links,
  secondary,
}: {
  links: NavLink[];
  secondary: NavLink;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="outline" aria-label="Open menu" />}
      >
        <Menu aria-hidden />
        Menu
      </SheetTrigger>
      <SheetContent side="right" className="w-full max-w-xs gap-0 p-0">
        <SheetHeader className="border-b p-5">
          <SheetTitle className="text-lg font-semibold">Menu</SheetTitle>
          <SheetDescription className="sr-only">
            Site navigation
          </SheetDescription>
        </SheetHeader>
        <nav aria-label="Main" className="flex flex-col p-3">
          {links.map((link) => {
            const active =
              pathname === link.href ||
              (link.href !== "/" && pathname.startsWith(`${link.href}/`));
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex min-h-12 items-center rounded-lg px-3 text-base font-medium text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active && "bg-primary-subtle text-accent-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-3 border-t p-5">
          <DisplayPreferences className="w-full justify-start sm:hidden" />
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            render={<Link href={secondary.href} />}
            onClick={() => setOpen(false)}
          >
            {secondary.label}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
