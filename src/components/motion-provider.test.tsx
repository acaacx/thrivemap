// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { domMax } from "motion/react";
import type { ReactNode } from "react";
import { MotionProvider } from "./motion-provider";

type LazyMotionProps = {
  children: ReactNode;
  features: unknown;
  strict?: boolean;
};

const { lazyMotion } = vi.hoisted(() => ({
  lazyMotion: vi.fn(({ children }: LazyMotionProps) => children),
}));

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();

  return {
    ...actual,
    LazyMotion: lazyMotion,
    MotionConfig: ({ children }: { children: ReactNode }) => children,
  };
});

vi.mock("@/lib/reduced-motion", () => ({
  useReducedMotion: () => false,
}));

afterEach(() => {
  cleanup();
  lazyMotion.mockClear();
});

describe("MotionProvider", () => {
  it("loads the domMax feature bundle for search-result position reflow", () => {
    render(
      <MotionProvider>
        <div>Search results</div>
      </MotionProvider>,
    );

    expect(lazyMotion).toHaveBeenCalledTimes(1);
    expect(lazyMotion.mock.calls[0][0].features).toBe(domMax);
  });
});
