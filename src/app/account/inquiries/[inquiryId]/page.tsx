import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/auth/server";
import { getInquiryThread } from "@/modules/inquiries/queries";
import { InquiryThreadView } from "@/modules/inquiries/components/InquiryThreadView";

export const metadata: Metadata = {
  title: "Inquiry",
  robots: { index: false },
};

export default async function InquiryThreadPage({
  params,
}: {
  params: Promise<{ inquiryId: string }>;
}) {
  await requireUser();
  const { inquiryId } = await params;
  const thread = await getInquiryThread(inquiryId);
  if (!thread) notFound();

  return <InquiryThreadView thread={thread} viewer="caregiver" />;
}
