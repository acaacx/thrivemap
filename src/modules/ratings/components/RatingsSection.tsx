import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRatingStats } from "../queries";
import { RatingSummary } from "./RatingSummary";
import { RatingsViewerPanel } from "./RatingsViewerPanel";

/**
 * Server component — renders the public stats surface using the cookie-free
 * anon client (getRatingStats), so it stays compatible with the clinic
 * page's ISR. Viewer-specific state (own rating, manager status, the form
 * itself) is resolved client-side by RatingsViewerPanel — see that file for
 * why it can't live here.
 */
export async function RatingsSection({
  clinicId,
  slug,
}: {
  clinicId: string;
  slug: string;
}) {
  const stats = await getRatingStats(clinicId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">
          <h2>Caregiver ratings</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <RatingSummary stats={stats} />
        <RatingsViewerPanel clinicId={clinicId} slug={slug} />
      </CardContent>
    </Card>
  );
}
