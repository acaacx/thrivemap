import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  /** Heading id — pair with `aria-labelledby` on the parent section. */
  id: string;
  title: string;
  lede?: string;
  /** Heading level. Sections default to h2. */
  as?: "h1" | "h2" | "h3";
  className?: string;
}

/**
 * One consistent section opener: a heading and (optionally) one short,
 * readable line under it. Predictable rhythm across every page.
 */
export function SectionHeader({
  id,
  title,
  lede,
  as: Heading = "h2",
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Heading
        id={id}
        className={cn(
          "font-semibold tracking-tight",
          Heading === "h1" ? "text-4xl sm:text-5xl" : "text-3xl",
          Heading === "h3" && "text-xl",
        )}
      >
        {title}
      </Heading>
      {lede && (
        <p className="max-w-prose text-base leading-relaxed text-muted-foreground sm:text-lg">
          {lede}
        </p>
      )}
    </div>
  );
}
