import type { Metadata } from "next";
import { StaticPage } from "@/components/static-page";
import { OfflineFavorites } from "./OfflineFavorites";

export const metadata: Metadata = {
  title: "You're offline",
  description: "Your saved clinics, available without a connection.",
};

export default function OfflinePage() {
  return (
    <StaticPage
      title="You're offline"
      lede="Your saved clinics are below. Details may have changed — reconnect for current information."
    >
      <OfflineFavorites />
    </StaticPage>
  );
}
