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

    await user.click(screen.getByRole("button", { name: "Hide map" }));

    expect(
      container.querySelector('section[aria-label="Map"]'),
    ).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("button", { name: "Show map" })).toBeVisible();
  });
});
