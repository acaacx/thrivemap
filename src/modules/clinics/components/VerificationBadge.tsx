import { BadgeCheck, CircleDashed, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function VerificationBadge({ status }: { status: string }) {
  if (status === "published_verified") {
    return (
      <Badge className="gap-1 bg-[var(--verified)] text-[var(--verified-foreground)] hover:bg-[var(--verified)]">
        <BadgeCheck className="size-3.5" aria-hidden />
        Verified
      </Badge>
    );
  }
  if (status === "temporarily_closed") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Clock className="size-3.5" aria-hidden />
        Temporarily closed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <CircleDashed className="size-3.5" aria-hidden />
      Unverified
    </Badge>
  );
}
