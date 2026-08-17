import { BadgeCheck, CircleDashed, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Listing status as icon + label + calm colour — never colour alone.
 * Server-safe (no client hooks); pair with <VerifiedInfoPopover /> where a
 * "What does verified mean?" affordance is wanted.
 */
export function VerificationBadge({ status }: { status: string }) {
  if (status === "published_verified") {
    return (
      <Badge variant="verified">
        <BadgeCheck aria-hidden />
        Verified
      </Badge>
    );
  }
  if (status === "temporarily_closed") {
    return (
      <Badge variant="warning">
        <Clock aria-hidden />
        Temporarily closed
      </Badge>
    );
  }
  return (
    <Badge variant="outline">
      <CircleDashed aria-hidden />
      Unverified
    </Badge>
  );
}
