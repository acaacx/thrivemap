"use client";

import Link from "next/link";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * "What does verified mean?" — a Popover, not a Tooltip: base-ui tooltips
 * open on hover only and never on touch. Rendered as a sibling of the
 * badge so the badge's own text stays exactly "Verified".
 */
export function VerifiedInfoPopover() {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="What does verified mean?"
            className="text-subtle hover:text-foreground"
          />
        }
      >
        <CircleHelp aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-3 p-4">
        <PopoverHeader>
          <PopoverTitle className="text-base font-semibold">
            What does verified mean?
          </PopoverTitle>
          <PopoverDescription className="text-sm leading-relaxed">
            A verified clinic has confirmed its details with ThriveMap — either
            a clinic representative claimed the listing, or our moderators
            checked it by hand. Unverified listings are community-contributed
            and may be incomplete.
          </PopoverDescription>
        </PopoverHeader>
        <Link
          href="/how-it-works"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          How verification works
        </Link>
      </PopoverContent>
    </Popover>
  );
}
