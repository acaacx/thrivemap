// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShell } from "./AppShell";

vi.mock("@/lib/use-media-query", () => ({
  useIsDesktop: () => true,
}));

afterEach(cleanup);

describe("AppShell desktop contextual map", () => {
  it("labels the map as a secondary preview and lets people hide it", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AppShell
        view="list"
        selectedId="clinic-1"
        search={<div>Search controls</div>}
        resultsHeader={<div>2 clinics found</div>}
        map={<div>Interactive clinic map</div>}
      >
        <div>Clinic results</div>
      </AppShell>,
    );

    expect(screen.getByRole("heading", { name: "Map preview" })).toBeVisible();
    expect(
      screen.getByText("Showing area around selected clinic"),
    ).toBeVisible();
    expect(screen.getByText("Interactive clinic map")).toBeVisible();

    const hideMapButton = screen.getByRole("button", { name: "Hide map" });
    const mapContent = screen.getByText("Interactive clinic map");
    hideMapButton.focus();

    await user.click(hideMapButton);

    const shell = container.querySelector('[data-slot="app-shell"]');
    const mapRegion = container.querySelector('section[aria-label="Map"]');

    expect(shell).toHaveClass("md:motion-reduce:transition-none");
    expect(mapRegion).toHaveAttribute("aria-hidden", "true");
    expect(mapRegion).toHaveAttribute("inert");
    expect(mapRegion).toHaveClass("md:motion-reduce:transition-none");
    expect(screen.getByText("Interactive clinic map")).toBe(mapContent);
    const showMapButton = screen.getByRole("button", { name: "Show map" });
    expect(showMapButton).toBeVisible();
    expect(showMapButton).toHaveFocus();

    await user.click(showMapButton);

    expect(mapRegion).not.toHaveAttribute("aria-hidden");
    expect(mapRegion).not.toHaveAttribute("inert");
    const restoredHideMapButton = screen.getByRole("button", {
      name: "Hide map",
    });
    expect(restoredHideMapButton).toBeVisible();
    expect(restoredHideMapButton).toHaveFocus();
    expect(screen.getByText("Interactive clinic map")).toBe(mapContent);
  });
});
