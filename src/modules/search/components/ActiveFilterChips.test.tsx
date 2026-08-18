// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActiveFilterChips, deriveActiveChips } from "./ActiveFilterChips";
import type { FilterState } from "./SearchFilters";

const base: FilterState = {
  services: [],
  ages: [],
  verified: false,
  online: false,
  inperson: false,
  open: false,
  accessible: false,
  radius: 10,
};

const serviceOptions = [
  { slug: "speech-therapy", name: "Speech & Language Therapy" },
  { slug: "occupational-therapy", name: "Occupational Therapy" },
];

describe("deriveActiveChips", () => {
  it("returns nothing when no filters or location are set", () => {
    expect(
      deriveActiveChips({
        filters: base,
        serviceOptions,
        onFiltersChange: () => {},
      }),
    ).toEqual([]);
  });

  it("lists location first, then services, ages, and flags with readable labels", () => {
    const chips = deriveActiveChips({
      filters: {
        ...base,
        services: ["speech-therapy"],
        ages: ["school_age"],
        open: true,
      },
      serviceOptions,
      location: "Quezon City",
      onFiltersChange: () => {},
      onClearLocation: () => {},
    });
    expect(chips.map((c) => c.label)).toEqual([
      "Quezon City",
      "Speech & Language Therapy",
      "School age",
      "Open now",
    ]);
  });

  it("removing a chip drops only that filter", () => {
    const onFiltersChange = vi.fn();
    const chips = deriveActiveChips({
      filters: {
        ...base,
        services: ["speech-therapy", "occupational-therapy"],
      },
      serviceOptions,
      onFiltersChange,
    });
    chips[0].remove();
    expect(onFiltersChange).toHaveBeenCalledWith({
      ...base,
      services: ["occupational-therapy"],
    });
  });

  it("falls back to the slug when a service is unknown", () => {
    const chips = deriveActiveChips({
      filters: { ...base, services: ["mystery"] },
      serviceOptions,
      onFiltersChange: () => {},
    });
    expect(chips[0].label).toBe("mystery");
  });
});

describe("ActiveFilterChips", () => {
  it("renders nothing without chips", () => {
    const { container } = render(
      <ActiveFilterChips chips={[]} onClearAll={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders removable chips and a clear-all action", async () => {
    const remove = vi.fn();
    const clear = vi.fn();
    render(
      <ActiveFilterChips
        chips={[{ key: "a", label: "Open now", remove }]}
        onClearAll={clear}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Remove filter: Open now" }),
    );
    expect(remove).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /clear all/i }));
    expect(clear).toHaveBeenCalled();
  });
});
