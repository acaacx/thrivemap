// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { MapErrorBoundary } from "./MapErrorBoundary";

function ThrowsOnRender(): never {
  throw new Error("no WebGL2");
}

function ThrowsInEffect() {
  useEffect(() => {
    // Mirrors how maplibre-gl fails: synchronously during init inside an effect.
    throw new Error("Failed to initialize WebGL2 context");
  }, []);
  return <div>map canvas</div>;
}

describe("MapErrorBoundary", () => {
  it("renders children when nothing throws", () => {
    render(
      <MapErrorBoundary fallback={<p>fallback</p>}>
        <p>the map</p>
      </MapErrorBoundary>,
    );
    expect(screen.getByText("the map")).toBeInTheDocument();
    expect(screen.queryByText("fallback")).not.toBeInTheDocument();
  });

  it("shows the fallback when a child throws during render", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <MapErrorBoundary fallback={<p>123 Fallback St, Quezon City</p>}>
        <ThrowsOnRender />
      </MapErrorBoundary>,
    );
    expect(
      screen.getByText("123 Fallback St, Quezon City"),
    ).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("shows the fallback when a child throws inside useEffect", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <MapErrorBoundary fallback={<p>address fallback</p>}>
        <ThrowsInEffect />
      </MapErrorBoundary>,
    );
    expect(screen.getByText("address fallback")).toBeInTheDocument();
    expect(screen.queryByText("map canvas")).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
