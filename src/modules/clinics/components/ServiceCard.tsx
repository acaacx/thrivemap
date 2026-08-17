import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ServiceGlyph } from "../service-glyph";

/** Rotating soft tints — one cohesive system, not a colour per service. */
const TINTS = ["bg-tint-blue", "bg-tint-sage", "bg-tint-lavender"] as const;

export interface ServiceCardData {
  slug: string;
  name: string;
  short_description?: string | null;
  icon?: string | null;
}

interface ServiceCardProps {
  service: ServiceCardData;
  /** Position in the grid; drives the tint rotation. */
  index: number;
  className?: string;
}

/**
 * Calm service card: simple icon, service name, one short description.
 * The whole card is the link; its accessible name is the service name.
 */
export function ServiceCard({ service, index, className }: ServiceCardProps) {
  const tint = TINTS[index % TINTS.length];
  return (
    <Link
      href={`/services/${service.slug}`}
      className={cn(
        "group flex min-h-44 flex-col gap-4 rounded-xl border border-border bg-card p-5 transition-colors duration-150 ease-calm hover:border-primary/60 hover:bg-primary-subtle/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-11 place-items-center rounded-lg text-accent-foreground",
          tint,
        )}
      >
        <ServiceGlyph icon={service.icon} className="size-5" />
      </span>
      <span className="flex flex-1 flex-col gap-1.5">
        <span className="text-base font-semibold text-foreground">
          {service.name}
        </span>
        {service.short_description && (
          <span className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {service.short_description}
          </span>
        )}
      </span>
      <span
        aria-hidden
        className="inline-flex items-center gap-1 text-sm font-medium text-primary"
      >
        View clinics
        <ArrowRight className="size-4" />
      </span>
    </Link>
  );
}
