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
  const user = await requireUser();
  const { inquiryId } = await params;
  const thread = await getInquiryThread(inquiryId);
  // RLS also grants the clinic's managers read access to this thread, but
  // this page is the caregiver-only surface — a manager who navigates here
  // (or guesses the URL) must not see it.
  if (!thread || thread.caregiverId !== user.id) notFound();

  return <InquiryThreadView thread={thread} />;
}
