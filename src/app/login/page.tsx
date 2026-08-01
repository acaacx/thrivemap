import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { AuthForm } from "@/modules/auth/components/AuthForm";
import { getCurrentUser } from "@/modules/auth/server";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/account");
  const { next } = await searchParams;

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
          <h1 className="font-heading text-3xl font-semibold">Welcome back</h1>
          <p className="mt-2 text-muted-foreground">
            Sign in to manage favorites, suggestions, and reports.
          </p>
          <div className="mt-8">
            <AuthForm mode="login" next={next} />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
