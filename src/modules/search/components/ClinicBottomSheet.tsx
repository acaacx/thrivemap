"use client";

import { animate, m, useMotionValue } from "motion/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useReducedMotion } from "@/lib/reduced-motion";
import { cn } from "@/lib/utils";
import type { SheetSnap } from "../search-ui-context";
import {
  nextSnap,
  resolveSnap,
  snapHeights,
  type SnapHeights,
} from "../sheet-snap";

interface ClinicBottomSheetProps {
  /**
   * True on small screens in map view: the block becomes a draggable sheet
   * over the map. False = plain results panel (desktop, or mobile list view).
   * The DOM node is the same either way so cards never remount.
   */
  enabled: boolean;
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  /** Always-visible top row (results header) — also the drag handle area. */
  header?: ReactNode;
  /** The scrolling results. */
  children: ReactNode;
  className?: string;
}

const DRAG_THRESHOLD_PX = 4;
const CALM_EASE = [0.22, 0.61, 0.36, 1] as const;

/**
 * Mobile results sheet with three snap points (collapsed peek, half, nearly
 * full). Drag from the handle/header, or from the list when it is scrolled
 * to the top (down) or the sheet is not yet expanded (up); otherwise the
 * list scrolls normally. The map stays visible and interactive behind it.
 * Reduced motion → snaps are instant.
 */
export function ClinicBottomSheet({
  enabled,
  snap,
  onSnapChange,
  header,
  children,
  className,
}: ClinicBottomSheetProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Always bound to `style` (a motion value added after mount is not
  // subscribed); "auto" when the block is a plain panel.
  const height = useMotionValue<number | "auto">("auto");
  const reduced = useReducedMotion();
  const [containerH, setContainerH] = useState(0);
  // Latest values for the (non-reactive) gesture handlers.
  const heightsRef = useRef<SnapHeights>(snapHeights(0));
  const snapRef = useRef(snap);
  const onSnapChangeRef = useRef(onSnapChange);
  useLayoutEffect(() => {
    heightsRef.current = snapHeights(containerH);
    snapRef.current = snap;
    onSnapChangeRef.current = onSnapChange;
  });

  // Measure the shell the sheet floats over.
  useLayoutEffect(() => {
    if (!enabled) return;
    const el = rootRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!parent) return;
    const measure = () => setContainerH(parent.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [enabled]);

  const settle = useCallback(
    (target: SheetSnap, instant: boolean) => {
      const px = heightsRef.current[target];
      if (instant || reduced) {
        height.jump(px);
        return;
      }
      animate(height, px, { duration: 0.24, ease: CALM_EASE });
    },
    [height, reduced],
  );

  // Follow the snap prop (and re-measurements). First run is instant so the
  // sheet does not grow from 0 on mount.
  const settledOnce = useRef(false);
  useLayoutEffect(() => {
    if (!enabled || containerH === 0) return;
    settle(snap, !settledOnce.current);
    settledOnce.current = true;
  }, [enabled, containerH, snap, settle]);

  // Leaving sheet mode: back to a plain panel.
  useEffect(() => {
    if (enabled) return;
    settledOnce.current = false;
    height.jump("auto");
  }, [enabled, height]);

  // ---- Drag (pointer events on the header, touch on the list) ----
  const drag = useRef<{
    startY: number;
    startHeight: number;
    lastY: number;
    lastT: number;
    velocity: number;
    active: boolean;
  } | null>(null);

  function currentHeight(): number {
    const h = height.get();
    return typeof h === "number" ? h : heightsRef.current[snapRef.current];
  }

  function beginDrag(y: number) {
    drag.current = {
      startY: y,
      startHeight: currentHeight(),
      lastY: y,
      lastT: performance.now(),
      velocity: 0,
      active: false,
    };
  }

  function moveDrag(y: number): boolean {
    const d = drag.current;
    if (!d) return false;
    const dy = d.startY - y; // finger up = positive = sheet grows
    if (!d.active) {
      if (Math.abs(dy) < DRAG_THRESHOLD_PX) return false;
      d.active = true;
    }
    const now = performance.now();
    const dt = Math.max(1, now - d.lastT);
    d.velocity = ((d.lastY - y) / dt) * 1000;
    d.lastY = y;
    d.lastT = now;
    const { collapsed, expanded } = heightsRef.current;
    height.set(Math.min(expanded, Math.max(collapsed, d.startHeight + dy)));
    return true;
  }

  function endDrag() {
    const d = drag.current;
    drag.current = null;
    if (!d?.active) return;
    const target = resolveSnap(currentHeight(), d.velocity, heightsRef.current);
    if (target === snapRef.current) settle(target, false);
    else onSnapChangeRef.current(target);
  }

  function onHeaderPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!enabled || e.button !== 0) return;
    beginDrag(e.clientY);
  }
  function onHeaderPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const wasActive = drag.current.active;
    if (moveDrag(e.clientY) && !wasActive) {
      // Only capture once a real drag starts so taps on header buttons
      // (the List | Map toggle) still click.
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }
  function onHeaderPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    endDrag();
  }

  // The list: native touch listeners (non-passive) so we can claim the
  // gesture before the browser starts scrolling.
  useEffect(() => {
    const list = listRef.current;
    if (!enabled || !list) return;
    let touchStart: number | null = null;
    let claimed = false;
    const onStart = (e: TouchEvent) => {
      touchStart = e.touches[0]?.clientY ?? null;
      claimed = false;
    };
    const onMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY;
      if (y == null || touchStart == null) return;
      if (!claimed) {
        const dy = touchStart - y; // positive = finger up
        if (Math.abs(dy) < DRAG_THRESHOLD_PX) return;
        const atTop = list.scrollTop <= 0;
        const wantsDown = dy < 0 && atTop;
        const wantsUp = dy > 0 && snapRef.current !== "expanded";
        if (!wantsDown && !wantsUp) {
          touchStart = null; // let the list scroll for this gesture
          return;
        }
        claimed = true;
        beginDrag(touchStart);
      }
      e.preventDefault();
      moveDrag(y);
    };
    const onEnd = () => {
      if (claimed) endDrag();
      touchStart = null;
      claimed = false;
    };
    list.addEventListener("touchstart", onStart, { passive: true });
    list.addEventListener("touchmove", onMove, { passive: false });
    list.addEventListener("touchend", onEnd);
    list.addEventListener("touchcancel", onEnd);
    return () => {
      list.removeEventListener("touchstart", onStart);
      list.removeEventListener("touchmove", onMove);
      list.removeEventListener("touchend", onEnd);
      list.removeEventListener("touchcancel", onEnd);
    };
    // beginDrag/moveDrag/endDrag read refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  function onHandleClick() {
    onSnapChange(snap === "expanded" ? "collapsed" : nextSnap(snap, "up"));
  }
  function onHandleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      onSnapChange(nextSnap(snap, "up"));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      onSnapChange(nextSnap(snap, "down"));
    }
  }

  return (
    <m.div
      ref={rootRef}
      data-slot="results-region"
      data-sheet-snap={enabled ? snap : undefined}
      role="region"
      aria-label="Search results"
      style={{ height }}
      className={cn(
        "flex min-h-0 flex-col bg-background",
        enabled
          ? // md: overrides keep the server-rendered (mobile-first) markup
            // correct on a desktop before hydration settles `enabled`.
            "absolute inset-x-0 bottom-0 z-10 min-h-(--sheet-collapsed-h) rounded-t-xl border-t md:static md:inset-auto md:z-auto md:h-auto! md:min-h-0 md:flex-1 md:rounded-none md:border-t-0"
          : "flex-1",
        className,
      )}
    >
      <div
        className={cn("shrink-0", enabled && "touch-none select-none")}
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
      >
        {enabled && (
          <button
            type="button"
            aria-label={
              snap === "expanded" ? "Collapse results" : "Expand results"
            }
            onClick={onHandleClick}
            onKeyDown={onHandleKeyDown}
            className="mx-auto grid h-6 w-full place-items-center rounded-t-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 md:hidden"
          >
            <span aria-hidden className="h-1 w-10 rounded-full bg-border" />
          </button>
        )}
        {header && (
          <div className={cn("px-3 sm:px-4", enabled ? "pb-2" : "pt-3 pb-2")}>
            {header}
          </div>
        )}
      </div>
      <div
        ref={listRef}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 pb-4 pt-1 sm:px-4"
      >
        {children}
      </div>
    </m.div>
  );
}
