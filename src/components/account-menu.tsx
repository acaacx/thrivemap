"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleUserRound } from "lucide-react";
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
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { signOut } from "@/modules/auth/actions";
import { SNAPSHOT_KEY } from "@/modules/favorites/snapshot";

/**
 * Auth state resolved client-side so SiteHeader stays static and ISR pages
 * (notably clinic profiles) keep their cache. getSession() reads the auth
 * cookie locally — no network. Re-read on every route change because sign-in
 * and sign-out are server actions that end in a redirect: the header persists
 * across that navigation, so the pathname change is our signal that cookies
 * may have changed. Display-only — servers re-verify auth on every action.
 */
export function AccountMenu() {
  const pathname = usePathname();
  // undefined = not yet resolved, null = signed out
  const [email, setEmail] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) setEmail(session?.user.email ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (email === undefined) {
    // Placeholder keeps the header height stable while the cookie is read.
    return <div className="h-10 w-16" aria-hidden />;
  }

  if (email === null) {
    // "Find clinics" already lives in the main nav; a second primary
    // button here would compete with it.
    return (
      <Button variant="ghost" render={<Link href="/login" />}>
        Sign in
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" aria-label="Account menu" />}
      >
        <CircleUserRound className="size-4" aria-hidden />
        <span className="hidden sm:inline">Account</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="max-w-52 truncate">
            {email}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/account" />}>
          Account
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/account/favorites" />}>
          Favorites
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/account/inquiries" />}>
          My inquiries
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
            render={
              <button
                type="submit"
                className="w-full"
                // Shared-device safety: the offline favorites snapshot
                // (src/modules/favorites/snapshot.ts) lives in localStorage,
                // which sign-out does not otherwise touch. Clear it here so
                // the next caregiver on this device doesn't see the
                // previous one's saved clinics on /offline. Runs
                // synchronously before the form's submit event proceeds to
                // the signOut server action.
                onClick={() => {
                  try {
                    window.localStorage.removeItem(SNAPSHOT_KEY);
                  } catch {
                    // Private mode / unavailable storage — nothing to clear.
                  }
                }}
              />
            }
          >
            Sign out
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
