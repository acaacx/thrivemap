import { redirect } from "next/navigation";

export default async function ManageClinicIndex({
  params,
}: {
  params: Promise<{ clinicId: string }>;
}) {
  const { clinicId } = await params;
  redirect(`/clinic-portal/${clinicId}/profile`);
}
