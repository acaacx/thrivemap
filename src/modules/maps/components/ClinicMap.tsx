"use client";

import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { Point } from "geojson";
import { isReducedMotion } from "@/lib/reduced-motion";
import type { MapBounds } from "../types";

// Turbopack doesn't emit the worker chunk MapLibre resolves relative to
// import.meta.url (the request 404s), so vector tiles never parse. Serve the
// worker ourselves — copied to public/ by scripts/copy-maplibre-worker.mjs.
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export interface ClinicMapMarker {
  id: string;
  slug: string;
  name: string;
  latitude: number;
  longitude: number;
  verified: boolean;
}

interface ClinicMapProps {
  markers: ClinicMapMarker[];
  center: { latitude: number; longitude: number };
  zoom?: number;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onMoved?: (
    bounds: MapBounds,
    center: { latitude: number; longitude: number },
    zoom: number,
  ) => void;
  /** Click anywhere on the map (used for pin placement in forms). */
  onMapClick?: (location: { latitude: number; longitude: number }) => void;
  /**
   * Identifies "a new search". When provided, the camera re-frames only when
   * this changes (eases to `center`, then fits the results once they arrive)
   * — never on filter tweaks or selection. `null` = the visitor framed the
   * map themselves ("Search this area"): leave the camera alone. When
   * omitted, the map simply follows `center` (pin-placement forms).
   */
  cameraKey?: string | null;
  /** True while `markers` still belong to a previous search (placeholder data). */
  markersStale?: boolean;
  className?: string;
}

/** Camera options that respect the OS and site reduce-motion settings. */
function motionOptions(): { duration?: number } {
  return isReducedMotion() ? { duration: 0 } : {};
}

/**
 * Interactive clinic map. Renders OpenFreeMap vector tiles (keyless, no usage
 * cap) via MapLibre. Clustering is native MapLibre GeoJSON clustering.
 *
 * Accessibility: the map is a supplement — every clinic shown here is also in
 * the results list, which is the primary accessible surface.
 */
export function ClinicMap({
  markers,
  center,
  zoom = 12,
  selectedId,
  onSelect,
  onMoved,
  onMapClick,
  cameraKey,
  markersStale = false,
  className,
}: ClinicMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  const onMovedRef = useRef(onMoved);
  const onMapClickRef = useRef(onMapClick);
  onSelectRef.current = onSelect;
  onMovedRef.current = onMoved;
  onMapClickRef.current = onMapClick;

  // Suppress onMoved for programmatic movements (only user gestures should
  // surface the "Search this area" affordance).
  const programmaticMove = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      // OpenFreeMap: keyless vector tiles, no usage cap — raw
      // tile.openstreetmap.org raster is off-limits for production apps.
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [center.longitude, center.latitude],
      zoom,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    if (process.env.NODE_ENV !== "production") {
      // Exposed for e2e tests and local debugging only.
      (window as unknown as Record<string, unknown>).__thrivemapMap = map;
    }
    map.on("error", (event) => {
      console.error("[ClinicMap] map error:", event.error);
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    map.keyboard.enable();

    map.on("load", () => {
      loadedRef.current = true;
      map.addSource("clinics", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 46,
      });

      // Individual points first: an error in a later (optional) layer must not
      // prevent clinic markers from appearing.
      map.addLayer({
        id: "clinic-point",
        type: "circle",
        source: "clinics",
        filter: ["!", ["has", "point_count"]],
        paint: {
          // Muted palette (globals.css): selected = --primary-hover, verified
          // = --primary, unverified = --subtle. Selection is also signalled by
          // size and stroke so it never relies on hue alone.
          "circle-color": [
            "case",
            ["boolean", ["get", "selected"], false],
            "#255b56",
            ["boolean", ["get", "verified"], false],
            "#2f6f68",
            "#5f6e6b",
          ],
          "circle-radius": [
            "case",
            ["boolean", ["get", "selected"], false],
            11,
            7,
          ],
          "circle-stroke-width": [
            "case",
            ["boolean", ["get", "selected"], false],
            3,
            2,
          ],
          "circle-stroke-color": "#ffffff",
        },
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "clinics",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#2f6f68",
          "circle-opacity": 0.9,
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 25, 26],
        },
      });

      try {
        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "clinics",
          filter: ["has", "point_count"],
          layout: {
            "text-field": "{point_count_abbreviated}",
            // Must exist in the style's glyph set (OpenFreeMap fonts).
            "text-font": ["Noto Sans Bold"],
            "text-size": 13,
          },
          paint: { "text-color": "#ffffff" },
        });
      } catch (error) {
        // Cluster counts are optional; clusters still render as sized circles.
        console.warn("[ClinicMap] cluster count labels unavailable:", error);
      }

      map.on("click", "clusters", async (e: maplibregl.MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const clusterId = feature.properties?.cluster_id as number;
        const source = map.getSource("clinics") as maplibregl.GeoJSONSource;
        const zoomTo = await source.getClusterExpansionZoom(clusterId);
        programmaticMove.current = true;
        map.easeTo({
          center: (feature.geometry as Point).coordinates as [number, number],
          zoom: zoomTo,
          ...motionOptions(),
        });
      });

      map.on("click", "clinic-point", (e: maplibregl.MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) onSelectRef.current?.(id);
      });

      map.on("mouseenter", "clinic-point", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "clinic-point", () => {
        map.getCanvas().style.cursor = "";
      });

      syncMarkers();
    });

    map.on("click", (e: maplibregl.MapMouseEvent) => {
      onMapClickRef.current?.({
        latitude: e.lngLat.lat,
        longitude: e.lngLat.lng,
      });
    });

    map.on("moveend", () => {
      if (programmaticMove.current) {
        programmaticMove.current = false;
        return;
      }
      const b = map.getBounds();
      const c = map.getCenter();
      onMovedRef.current?.(
        {
          north: b.getNorth(),
          south: b.getSouth(),
          east: b.getEast(),
          west: b.getWest(),
        },
        { latitude: c.lat, longitude: c.lng },
        map.getZoom(),
      );
    });

    return () => {
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function syncMarkers() {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const source = map.getSource("clinics") as
      maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: "FeatureCollection",
      features: markers.map((m) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [m.longitude, m.latitude] },
        properties: {
          id: m.id,
          name: m.name,
          verified: m.verified,
          selected: m.id === selectedId,
        },
      })),
    });
  }

  useEffect(syncMarkers, [markers, selectedId]);

  // Legacy mode (no cameraKey): follow `center` whenever it changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || cameraKey !== undefined) return;
    programmaticMove.current = true;
    map.easeTo({
      center: [center.longitude, center.latitude],
      zoom,
      ...motionOptions(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.latitude, center.longitude]);

  // Search mode: a new cameraKey eases to the search centre and arms a
  // one-off fit; the fit runs once results for that search are on the map.
  const fitPendingRef = useRef<string | null>(null);
  const lastKeyRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || cameraKey === undefined) return;
    if (lastKeyRef.current === cameraKey) return;
    const first = lastKeyRef.current === undefined;
    lastKeyRef.current = cameraKey;
    if (cameraKey === null) {
      fitPendingRef.current = null;
      return;
    }
    fitPendingRef.current = cameraKey;
    if (!first) {
      programmaticMove.current = true;
      map.easeTo({
        center: [center.longitude, center.latitude],
        zoom,
        ...motionOptions(),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || cameraKey == null) return;
    if (markersStale) return;
    if (fitPendingRef.current !== cameraKey || markers.length === 0) return;
    fitPendingRef.current = null;
    const bounds = new maplibregl.LngLatBounds();
    for (const marker of markers) {
      bounds.extend([marker.longitude, marker.latitude]);
    }
    bounds.extend([center.longitude, center.latitude]);
    programmaticMove.current = true;
    map.fitBounds(bounds, {
      padding: 56,
      maxZoom: 14,
      ...motionOptions(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, cameraKey, markersStale]);

  // Selection: bring the marker into view only if it is off-screen, and
  // keep the visitor's zoom either way.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const marker = markers.find((m) => m.id === selectedId);
    if (!marker) return;
    const lngLat: [number, number] = [marker.longitude, marker.latitude];
    if (map.getBounds().contains(lngLat)) return;
    programmaticMove.current = true;
    map.easeTo({ center: lngLat, ...motionOptions() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return (
    <div
      ref={containerRef}
      className={className}
      role="region"
      aria-label="Map of clinic locations. All clinics are also listed in the results list."
    />
  );
}
