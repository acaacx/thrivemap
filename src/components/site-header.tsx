import Link from "next/link";
import { CircleUserRound, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { siteConfig } from "@/lib/site-config";
import { signOut } from "@/modules/auth/actions";
import { getCurrentUser } from "@/modules/auth/server";

const navLinks = [
  { href: "/clinics", label: "Find clinics" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/suggest-clinic", label: "Suggest a clinic" },
];

export async function SiteHeader() {
  const user = await getCurrentUser();

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
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    className="rounded-full"
                    aria-label="Account menu"
                  />
                }
              >
                <CircleUserRound className="size-4" aria-hidden />
                <span className="hidden sm:inline">Account</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="max-w-52 truncate">
                    {user.email}
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href="/account" />}>
                  Account
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/account/favorites" />}>
                  Favorites
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/account/submissions" />}>
                  My submissions
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/account/reports" />}>
                  My reports
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <form action={signOut}>
                  <DropdownMenuItem
                    render={<button type="submit" className="w-full" />}
                  >
                    Sign out
                  </DropdownMenuItem>
                </form>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button
                variant="ghost"
                className="rounded-full"
                render={<Link href="/login" />}
              >
                Sign in
              </Button>
              <Button
                className="rounded-full"
                render={<Link href="/clinics" />}
              >
                Search
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
