// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ClinicPreview, type ClinicPreviewData } from "./ClinicPreview";

afterEach(cleanup);

const clinic: ClinicPreviewData = {
  id: "clinic-1",
  slug: "bright-path",
  name: "Bright Path Therapy Center",
  status: "published_verified",
  address: "123 Main Street",
  city: "Bacoor",
  province: "Cavite",
  latitude: 14.41,
  longitude: 120.97,
  isOpenNow: false,
  phone: "+63 900 000 0000",
  website: "example.com",
  serviceNames: [
    "Occupational Therapy",
    "Speech & Language Therapy",
    "Behavioral Therapy",
    "Physical Therapy",
    "Early Intervention",
  ],
};

describe("ClinicPreview map variant", () => {
  it("keeps the contextual map card concise", () => {
    render(<ClinicPreview clinic={clinic} onClose={() => {}} variant="map" />);

    expect(screen.getByText("Bright Path Therapy Center")).toBeInTheDocument();
    expect(screen.getByText("Bacoor, Cavite")).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /view clinic/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("123 Main Street")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /directions/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /call/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /website/i }),
    ).not.toBeInTheDocument();
  });
});
