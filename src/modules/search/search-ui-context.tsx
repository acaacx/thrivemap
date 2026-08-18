"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** Snap positions of the mobile results sheet. */
export type SheetSnap = "collapsed" | "mid" | "expanded";

export interface SearchUIState {
  /** Clinic highlighted in both the list and on the map (URL `sel=`). */
  selectedId: string | null;
  setSelected: (id: string | null) => void;
  /** Card the pointer is over — the map echoes it; never persisted. */
  hoveredId: string | null;
  setHovered: (id: string | null) => void;
  sheetSnap: SheetSnap;
  setSheetSnap: (snap: SheetSnap) => void;
}

const SearchUIContext = createContext<SearchUIState | null>(null);

interface SearchUIProviderProps {
  children: ReactNode;
  /** Controlled selection (the search page owns it and mirrors it to the URL). */
  selectedId?: string | null;
  initialSelectedId?: string | null;
  initialSheetSnap?: SheetSnap;
  /** Fires after selection changes so the URL / map can follow. */
  onSelectedChange?: (id: string | null) => void;
}

/**
 * Small shared state that keeps the list, the map, and the mobile sheet in
 * step. Deliberately not the search params themselves — those live in the
 * URL. Selection is UI state that other surfaces mirror.
 */
export function SearchUIProvider({
  children,
  selectedId: controlledSelectedId,
  initialSelectedId = null,
  initialSheetSnap = "collapsed",
  onSelectedChange,
}: SearchUIProviderProps) {
  const [internalSelectedId, setSelectedState] = useState<string | null>(
    initialSelectedId,
  );
  const selectedId =
    controlledSelectedId === undefined
      ? internalSelectedId
      : controlledSelectedId;
  const [hoveredId, setHovered] = useState<string | null>(null);
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>(initialSheetSnap);

  const setSelected = useCallback(
    (id: string | null) => {
      setSelectedState(id);
      onSelectedChange?.(id);
    },
    [onSelectedChange],
  );

  const value = useMemo<SearchUIState>(
    () => ({
      selectedId,
      setSelected,
      hoveredId,
      setHovered,
      sheetSnap,
      setSheetSnap,
    }),
    [selectedId, setSelected, hoveredId, sheetSnap],
  );

  return (
    <SearchUIContext.Provider value={value}>
      {children}
    </SearchUIContext.Provider>
  );
}

export function useSearchUI(): SearchUIState {
  const ctx = useContext(SearchUIContext);
  if (!ctx) {
    throw new Error("useSearchUI must be used inside <SearchUIProvider>");
  }
  return ctx;
}
