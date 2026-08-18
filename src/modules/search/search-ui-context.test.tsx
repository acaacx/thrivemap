import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { SearchUIProvider, useSearchUI } from "./search-ui-context";

describe("SearchUIContext", () => {
  it("shares selection, hover, and sheet snap", () => {
    const onSelectedChange = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SearchUIProvider onSelectedChange={onSelectedChange}>
        {children}
      </SearchUIProvider>
    );
    const { result } = renderHook(() => useSearchUI(), { wrapper });

    expect(result.current.selectedId).toBeNull();
    expect(result.current.sheetSnap).toBe("collapsed");

    act(() => result.current.setSelected("abc"));
    expect(result.current.selectedId).toBe("abc");
    expect(onSelectedChange).toHaveBeenCalledWith("abc");

    act(() => result.current.setHovered("xyz"));
    expect(result.current.hoveredId).toBe("xyz");

    act(() => result.current.setSheetSnap("mid"));
    expect(result.current.sheetSnap).toBe("mid");
  });

  it("can be controlled", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SearchUIProvider selectedId="fixed">{children}</SearchUIProvider>
    );
    const { result } = renderHook(() => useSearchUI(), { wrapper });
    act(() => result.current.setSelected("other"));
    expect(result.current.selectedId).toBe("fixed");
  });

  it("throws outside the provider", () => {
    expect(() => renderHook(() => useSearchUI())).toThrow(/SearchUIProvider/);
  });
});
