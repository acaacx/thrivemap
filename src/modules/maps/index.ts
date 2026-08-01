import "server-only";
import { DevMapProvider } from "./providers/dev";
import { GoogleMapsProvider } from "./providers/google";
import type { MapProvider } from "./types";

export type { MapProvider } from "./types";
export * from "./types";

let provider: MapProvider | undefined;

/** Returns the configured map provider; falls back to the dev adapter. */
export function getMapProvider(): MapProvider {
  if (!provider) {
    if (process.env.GOOGLE_MAPS_SERVER_API_KEY) {
      provider = new GoogleMapsProvider();
    } else {
      console.info("[DEV ADAPTER] Google Maps not configured — using DevMapProvider.");
      provider = new DevMapProvider();
    }
  }
  return provider;
}
