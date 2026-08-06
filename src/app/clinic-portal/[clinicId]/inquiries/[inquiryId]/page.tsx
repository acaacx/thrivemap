import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireManagedClinic } from "@/modules/portal/server";
import { getInquiryThread } from "@/modules/inquiries/queries";
import { InquiryThreadView } from "@/modules/inquiries/components/InquiryThreadView";
import { InquiryStatusControls } from "@/modules/inquiries/components/InquiryStatusControls";

export const metadata: Metadata = {
  title: "Inquiry",
  robots: { index: false },
};

export default async function PortalInquiryThreadPage({
  params,
}: {
  params: Promise<{ clinicId: string; inquiryId: string }>;
}) {
  const { clinicId, inquiryId } = await params;
  await requireManagedClinic(clinicId);
  const thread = await getInquiryThread(inquiryId);
  if (!thread || thread.clinicId !== clinicId) notFound();

  return (
    <InquiryThreadView thread={thread} viewer="clinic">
      <InquiryStatusControls
        inquiryId={thread.id}
        status={thread.status}
        preferredDate={thread.preferredDate}
      />
    </InquiryThreadView>
  );
}
