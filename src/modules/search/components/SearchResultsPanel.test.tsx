// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SearchUIProvider } from "../search-ui-context";
import { SearchResults, type SearchClinicRow } from "./SearchResultsPanel";

vi.mock("@/lib/use-media-query", () => ({
  useIsDesktop: () => true,
}));
vi.mock("@/modules/favorites/components/FavoriteButton", () => ({
  FavoriteButton: () => null,
}));

afterEach(cleanup);

const clinic: SearchClinicRow = {
  clinic_id: "clinic-1",
  slug: "bright-path",
  name: "Bright Path Therapy Center",
  status: "published_verified",
  address_line1: null,
  barangay: null,
  city: "Bacoor",
  province: "Cavite",
  latitude: 14.41,
  longitude: 120.97,
  distance_km: null,
  is_open_now: false,
  service_names: ["Occupational Therapy"],
  offers_online_services: false,
  last_verified_at: null,
  logo_url: null,
};

describe("SearchResults desktop selection", () => {
  it("keeps the selected clinic in the list without duplicating its preview", () => {
    const { container } = render(
      <SearchUIProvider selectedId="clinic-1">
        <SearchResults clinics={[clinic]} />
      </SearchUIProvider>,
    );

    expect(screen.getAllByText("Bright Path Therapy Center")).toHaveLength(1);
    expect(container.querySelector('[data-slot="clinic-preview"]')).toBeNull();
    expect(
      container.querySelector('[data-clinic-id="clinic-1"]'),
    ).toHaveAttribute("aria-current", "true");
  });
});
