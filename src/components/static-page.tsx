import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export function StaticPage({
  title,
  lede,
  children,
}: {
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <div className="border-b bg-secondary">
          <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {title}
            </h1>
            {lede && (
              <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted-foreground">
                {lede}
              </p>
            )}
          </div>
        </div>
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-12 text-base leading-relaxed sm:px-6 sm:py-16 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_p]:text-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_ul]:text-foreground">
          {children}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
