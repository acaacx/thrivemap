import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false },
};

const accountNav = [
  { href: "/account", label: "Profile" },
  { href: "/account/favorites", label: "Favorites" },
  { href: "/account/submissions", label: "Submissions" },
  { href: "/account/reports", label: "Reports" },
  { href: "/account/claims", label: "Claims" },
];

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[200px_1fr]">
          <nav
            aria-label="Account"
            className="flex gap-2 overflow-x-auto md:flex-col"
          >
            {accountNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full border bg-card px-4 py-2 text-sm whitespace-nowrap hover:border-primary/40 md:rounded-lg"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="min-w-0">{children}</div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
