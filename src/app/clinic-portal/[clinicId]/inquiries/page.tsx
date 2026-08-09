import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { requireManagedClinic } from "@/modules/portal/server";
import { listClinicInquiries } from "@/modules/inquiries/queries";
import {
  INQUIRY_STATUS_LABELS,
  INQUIRY_STATUSES,
  type InquiryStatus,
} from "@/modules/inquiries/schemas";

export const metadata: Metadata = {
  title: "Inquiries",
  robots: { index: false },
};

const FILTERS: { value: InquiryStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: INQUIRY_STATUS_LABELS.open },
  { value: "replied", label: INQUIRY_STATUS_LABELS.replied },
  { value: "confirmed", label: INQUIRY_STATUS_LABELS.confirmed },
  { value: "declined", label: INQUIRY_STATUS_LABELS.declined },
  { value: "closed", label: INQUIRY_STATUS_LABELS.closed },
];

function isInquiryStatus(value: string): value is InquiryStatus {
  return (INQUIRY_STATUSES as readonly string[]).includes(value);
}

function statusVariant(
  status: InquiryStatus,
): "default" | "secondary" | "destructive" {
  if (status === "confirmed") return "default";
  if (status === "declined") return "destructive";
  return "secondary";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function PortalInquiriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ clinicId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clinicId } = await params;
  const rawParams = await searchParams;
  await requireManagedClinic(clinicId);

  const rawStatus = rawParams.status;
  const statusValue = Array.isArray(rawStatus) ? rawStatus[0] : rawStatus;
  const statusFilter =
    statusValue && isInquiryStatus(statusValue) ? statusValue : undefined;

  const inquiries = await listClinicInquiries(clinicId, statusFilter);

  return (
    <div className="space-y-4">
      <h1 className="font-heading text-2xl font-semibold">Inquiries</h1>

      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const active =
            filter.value === "all"
              ? !statusFilter
              : statusFilter === filter.value;
          const href =
            filter.value === "all"
              ? `/clinic-portal/${clinicId}/inquiries`
              : `/clinic-portal/${clinicId}/inquiries?status=${filter.value}`;
          return (
            <Link
              key={filter.value}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`rounded-full border px-3 py-1.5 text-sm whitespace-nowrap ${
                active
                  ? "border-primary/40 bg-primary/10 font-medium text-foreground"
                  : "bg-card text-muted-foreground hover:border-primary/40"
              }`}
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>

      {inquiries.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No inquiries yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {inquiries.map((inquiry) => (
            <li key={inquiry.id}>
              <Link
                href={`/clinic-portal/${clinicId}/inquiries/${inquiry.id}`}
                className="block rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{inquiry.subject}</p>
                    {inquiry.preferredDate && (
                      <p className="text-sm text-muted-foreground">
                        Preferred: {inquiry.preferredDate}
                      </p>
                    )}
                    {inquiry.lastMessagePreview && (
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {inquiry.lastMessagePreview}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(inquiry.lastMessageAt)}
                    </p>
                  </div>
                  <Badge variant={statusVariant(inquiry.status)}>
                    {INQUIRY_STATUS_LABELS[inquiry.status]}
                  </Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
