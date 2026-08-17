// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocationSearchBox } from "./LocationSearchBox";

// Regression: ISSUE-006 — LocationSearchBox always rendered its own <form>,
// so embedding it in SuggestClinicForm produced invalid nested forms and let
// Enter / free text bubble into the host form or navigate away.
// Found by /qa on 2026-08-18
// Report: .gstack/qa-reports/qa-report-localhost-2026-08-18.md

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const toastInfo = vi.fn();
vi.mock("sonner", () => ({
  toast: { info: (...args: unknown[]) => toastInfo(...args), error: vi.fn() },
}));

afterEach(cleanup);

beforeEach(() => {
  push.mockReset();
  toastInfo.mockReset();
  // No suggestions from the API: exercises the free-text branch.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ suggestions: [] }),
    })),
  );
});

describe("LocationSearchBox", () => {
  it("renders a <form> by default and navigates on free-text search", async () => {
    const user = userEvent.setup();
    render(<LocationSearchBox />);

    expect(
      screen.getByRole("search", { name: /find clinics by location/i }).tagName,
    ).toBe("FORM");

    await user.type(
      screen.getByRole("combobox", { name: /search by city/i }),
      "Zzzqx{Enter}",
    );
    expect(push).toHaveBeenCalledWith("/clinics?q=Zzzqx");
  });

  it("embedded: renders no <form>, never submits the host form, and does not navigate", async () => {
    const user = userEvent.setup();
    const hostSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={hostSubmit}>
        <LocationSearchBox embedded submitLabel="Search area" />
      </form>,
    );

    const search = screen.getByRole("search", {
      name: /find clinics by location/i,
    });
    expect(search.tagName).not.toBe("FORM");
    expect(search.closest("form")?.querySelector("form")).toBeNull();

    await user.type(
      screen.getByRole("combobox", { name: /search by city/i }),
      "Zzzqx{Enter}",
    );
    expect(hostSubmit).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(toastInfo).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Search area" }));
    expect(hostSubmit).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(toastInfo).toHaveBeenCalledTimes(2);
  });
});
