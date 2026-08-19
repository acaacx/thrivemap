// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SEARCH_RESULT_LAYOUT_TRANSITION } from "../motion";
import { SearchUIProvider } from "../search-ui-context";
import { SearchResults, type SearchClinicRow } from "./SearchResultsPanel";

const { motionDiv } = vi.hoisted(() => ({
  motionDiv: vi.fn(),
}));

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();

  return {
    ...actual,
    m: {
      ...actual.m,
      div: motionDiv,
    },
  };
});

vi.mock("@/lib/use-media-query", () => ({
  useIsDesktop: () => true,
}));
vi.mock("@/modules/favorites/components/FavoriteButton", () => ({
  FavoriteButton: () => null,
}));

function MotionDivTestDouble({
  children,
  layout: _layout,
  layoutDependency: _layoutDependency,
  transition: _transition,
  ...props
}: ComponentProps<"div"> & {
  layout?: "position";
  layoutDependency?: unknown;
  transition?: unknown;
}) {
  void _layout;
  void _layoutDependency;
  void _transition;

  return <div {...props}>{children}</div>;
}

beforeEach(() => {
  motionDiv.mockImplementation(MotionDivTestDouble);
});

afterEach(() => {
  cleanup();
  motionDiv.mockReset();
});

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
  it("keeps one semantic card per clinic inside position-only motion wrappers", () => {
    const secondClinic = {
      ...clinic,
      clinic_id: "clinic-2",
      slug: "bright-path-two",
      name: "Bright Path Therapy Center Two",
    };
    const { container } = render(
      <SearchUIProvider>
        <SearchResults clinics={[clinic, secondClinic]} />
      </SearchUIProvider>,
    );

    expect(
      container.querySelectorAll('[data-motion-result="position"]'),
    ).toHaveLength(2);
    expect(container.querySelectorAll("[data-clinic-id]")).toHaveLength(2);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(2);
  });

  it("uses position-only layout motion tied to the current results array", () => {
    const clinics = [
      clinic,
      {
        ...clinic,
        clinic_id: "clinic-2",
        slug: "bright-path-two",
        name: "Bright Path Therapy Center Two",
      },
    ];

    render(
      <SearchUIProvider>
        <SearchResults clinics={clinics} />
      </SearchUIProvider>,
    );

    expect(motionDiv).toHaveBeenCalledTimes(clinics.length);
    for (const [props] of motionDiv.mock.calls) {
      expect(props.layout).toBe("position");
      expect(props.layoutDependency).toBe(clinics);
      expect(props.transition).toBe(SEARCH_RESULT_LAYOUT_TRANSITION);
    }
  });

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
