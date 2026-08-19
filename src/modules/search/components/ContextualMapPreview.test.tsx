// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  Children,
  cloneElement,
  type ReactElement,
  type ReactNode,
  useRef,
} from "react";
import { ContextualMapPreview } from "./ContextualMapPreview";
import type { ClinicPreviewData } from "./ClinicPreview";

const motionPreference = vi.hoisted(() => ({ reduced: false }));

vi.mock("@/modules/favorites/components/FavoriteButton", () => ({
  FavoriteButton: () => null,
}));
vi.mock("@/lib/reduced-motion", () => ({
  useReducedMotion: () => motionPreference.reduced,
}));

afterEach(() => {
  cleanup();
  motionPreference.reduced = false;
});

const preview: ClinicPreviewData = {
  id: "clinic-1",
  slug: "bright-path",
  name: "Bright Path Therapy Center",
  status: "published_verified",
  city: "Bacoor",
  province: "Cavite",
  serviceNames: ["Occupational Therapy"],
};
const replacementPreview: ClinicPreviewData = {
  ...preview,
  id: "clinic-2",
  slug: "kindred-care",
  name: "Kindred Care Center",
};

describe("ContextualMapPreview", () => {
  it("renders one actionable map preview only when a clinic is selected", () => {
    const { container, rerender } = render(
      <ContextualMapPreview preview={null} onClose={() => {}} />,
    );

    expect(
      container.querySelector('[data-slot="contextual-map-preview"]'),
    ).toBeNull();

    rerender(<ContextualMapPreview preview={preview} onClose={() => {}} />);

    expect(
      container.querySelectorAll('[data-slot="contextual-map-preview"]'),
    ).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: /view clinic/i }),
    ).toBeInTheDocument();
  });

  it("makes an exiting preview inaccessible until its replacement enters", async () => {
    let isPresent = true;
    vi.resetModules();
    vi.doMock("@/lib/reduced-motion", () => ({
      useReducedMotion: () => false,
    }));
    vi.doMock("motion/react", async (importOriginal) => {
      const actual = await importOriginal<typeof import("motion/react")>();
      return {
        ...actual,
        AnimatePresence: ({ children }: { children: ReactNode }) => {
          const child = Children.only(children) as ReactElement;
          const exitingChild = useRef(child);
          if (isPresent) exitingChild.current = child;
          return isPresent ? child : cloneElement(exitingChild.current);
        },
        useIsPresent: () => isPresent,
      };
    });
    const { ContextualMapPreview: NormalMotionPreview } =
      await import("./ContextualMapPreview");
    const { container, rerender } = render(
      <NormalMotionPreview preview={preview} onClose={() => {}} />,
    );

    isPresent = false;
    rerender(
      <NormalMotionPreview preview={replacementPreview} onClose={() => {}} />,
    );

    const exitingPreview = container.querySelector(
      '[data-slot="contextual-map-preview"]',
    );
    expect(
      container.querySelectorAll('[data-slot="contextual-map-preview"]'),
    ).toHaveLength(1);
    expect(exitingPreview).toHaveTextContent("Bright Path Therapy Center");
    expect(exitingPreview).toHaveAttribute("inert");
    expect(exitingPreview).toHaveAttribute("aria-hidden", "true");
    expect(exitingPreview).toHaveStyle({ pointerEvents: "none" });
    expect(
      screen.queryByRole("button", { name: /view clinic: bright path/i }),
    ).not.toBeInTheDocument();

    isPresent = true;
    rerender(
      <NormalMotionPreview preview={replacementPreview} onClose={() => {}} />,
    );
    expect(
      screen.getByRole("button", { name: /view clinic: kindred care/i }),
    ).toBeInTheDocument();
    expect(
      container.querySelectorAll('[data-slot="contextual-map-preview"]'),
    ).toHaveLength(1);
  });

  it("replaces previews immediately when reduced motion is enabled", async () => {
    const animatePresence = vi.fn();
    vi.resetModules();
    vi.doMock("@/lib/reduced-motion", () => ({
      useReducedMotion: () => true,
    }));
    vi.doMock("motion/react", async (importOriginal) => {
      const actual = await importOriginal<typeof import("motion/react")>();
      return {
        ...actual,
        AnimatePresence: ({ children }: { children: ReactNode }) => {
          animatePresence();
          return children;
        },
      };
    });
    const { ContextualMapPreview: ReducedMotionPreview } =
      await import("./ContextualMapPreview");
    const { container, rerender } = render(
      <ReducedMotionPreview preview={preview} onClose={() => {}} />,
    );

    rerender(
      <ReducedMotionPreview preview={replacementPreview} onClose={() => {}} />,
    );

    expect(animatePresence).not.toHaveBeenCalled();
    expect(
      container.querySelectorAll('[data-slot="contextual-map-preview"]'),
    ).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: /view clinic: kindred care/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Bright Path Therapy Center"),
    ).not.toBeInTheDocument();
  });
});
