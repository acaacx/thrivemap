"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { OwnRating } from "../queries";
import { RatingForm } from "./RatingForm";

interface RatingsViewerPayload {
  signedIn: boolean;
  isManager: boolean;
  own: OwnRating | null;
}

/**
 * Viewer-specific state (signed-in?, own rating, manager status) resolved
 * client-side via /api/ratings/own. Split out of RatingsSection — a server
 * component — because this is per-viewer, cookie-derived state: resolving
 * it during the page's own render would force createSupabaseServerClient()
 * (cookies()) into /clinics/[slug], which is ISR'd (revalidate = 300) and
 * would fall back to per-request dynamic rendering. Mirrors FavoriteButton.
 */
function useRatingsViewerState(clinicId: string) {
  return useQuery<RatingsViewerPayload>({
    queryKey: ["ratings-own", clinicId],
    queryFn: async () => {
      const res = await fetch(
        `/api/ratings/own?clinicId=${encodeURIComponent(clinicId)}`,
      );
      if (!res.ok) throw new Error("ratings fetch failed");
      return res.json();
    },
    staleTime: 60_000,
  });
}

export function RatingsViewerPanel({
  clinicId,
  slug,
}: {
  clinicId: string;
  slug: string;
}) {
  const { data, isPending } = useRatingsViewerState(clinicId);

  // Avoid flashing the sign-in prompt (or an empty form) before the fetch
  // resolves — render nothing rather than guess.
  if (isPending || !data) return null;

  if (!data.signedIn) {
    return (
      <p className="text-sm text-muted-foreground">
        <Link
          href={`/login?next=${encodeURIComponent(`/clinics/${slug}`)}`}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Sign in
        </Link>{" "}
        to rate this clinic.
      </p>
    );
  }

  if (data.isManager) return null;

  return <RatingForm clinicId={clinicId} slug={slug} own={data.own} />;
}
