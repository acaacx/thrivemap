"use client";

import { Component, type ReactNode } from "react";

interface MapErrorBoundaryProps {
  /** Static content shown in place of the map when it fails to render. */
  fallback: ReactNode;
  children: ReactNode;
}

interface MapErrorBoundaryState {
  hasError: boolean;
}

/**
 * Local error boundary for map renders. MapLibre throws during init when the
 * environment lacks WebGL2 (headless browsers, some VMs); without a boundary
 * that crash takes down the whole page. The map is always a supplement to
 * textual content, so degrading to a static fallback is safe.
 */
export class MapErrorBoundary extends Component<
  MapErrorBoundaryProps,
  MapErrorBoundaryState
> {
  state: MapErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): MapErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[MapErrorBoundary] map failed to render:", error);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
