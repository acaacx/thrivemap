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
        <div className="bg-secondary/50">
          <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
            <h1 className="font-heading text-3xl font-semibold sm:text-4xl">
              {title}
            </h1>
            {lede && (
              <p className="mt-3 text-lg text-muted-foreground">{lede}</p>
            )}
          </div>
        </div>
        <div className="prose-headings:font-heading mx-auto max-w-3xl space-y-6 px-4 py-10 text-[15px] leading-relaxed sm:px-6 [&_h2]:font-heading [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-8 [&_p]:text-foreground/85 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_ul]:text-foreground/85">
          {children}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
