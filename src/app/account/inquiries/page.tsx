import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/modules/auth/server";
import { listMyInquiries } from "@/modules/inquiries/queries";
import {
  INQUIRY_STATUS_LABELS,
  type InquiryStatus,
} from "@/modules/inquiries/schemas";

export const metadata: Metadata = {
  title: "Your inquiries",
  robots: { index: false },
};

function statusVariant(
  status: InquiryStatus,
): "default" | "secondary" | "destructive" {
  if (status === "confirmed") return "default";
  if (status === "declined") return "destructive";
  return "secondary";
}

/** "Today" / "Yesterday" / "N days ago" / calendar date once it's stale. */
function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString("en-PH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function InquiriesPage() {
  await requireUser();
  const inquiries = await listMyInquiries();

  return (
    <div className="space-y-4">
      <h1 className="font-heading text-2xl font-semibold">Inquiries</h1>
      {inquiries.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          <p>No inquiries yet.</p>
          <p className="mt-1">
            <Link href="/clinics" className="underline underline-offset-4">
              Find a clinic
            </Link>{" "}
            and send one.
          </p>
        </div>
      ) : (
        inquiries.map((inquiry) => (
          <Card
            key={inquiry.id}
            className="relative border transition-colors hover:border-primary/40"
          >
            <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  <Link
                    href={`/account/inquiries/${inquiry.id}`}
                    className="after:absolute after:inset-0"
                  >
                    {inquiry.subject}
                  </Link>
                </p>
                <p className="text-sm text-muted-foreground">
                  <Link
                    href={`/clinics/${inquiry.clinicSlug}`}
                    className="relative z-10 underline-offset-4 hover:underline"
                  >
                    {inquiry.clinicName}
                  </Link>
                </p>
                {inquiry.lastMessagePreview && (
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {inquiry.lastMessagePreview}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatRelativeDate(inquiry.lastMessageAt)}
                </p>
              </div>
              <Badge variant={statusVariant(inquiry.status)}>
                {INQUIRY_STATUS_LABELS[inquiry.status]}
              </Badge>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
