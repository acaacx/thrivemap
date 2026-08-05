import "server-only";
import { logger } from "@/lib/logger";
import { FixturePlacesProvider } from "./providers/fixtures";
import { GooglePlacesProvider } from "./providers/google";
import type { PlacesProvider } from "./types";

export function getPlacesProvider(): PlacesProvider {
  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (apiKey) return new GooglePlacesProvider(apiKey);
  logger.info(
    "[DEV ADAPTER] Google Places not configured — using FixturePlacesProvider.",
  );
  return new FixturePlacesProvider();
}
