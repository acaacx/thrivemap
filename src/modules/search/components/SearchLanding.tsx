"use client";

import { LocationPermissionPrompt } from "./LocationPermissionPrompt";
import { ServiceChip } from "./ServiceChip";
import type { GeoResult } from "../use-geolocate";

const SHORTCUT_COUNT = 5;

/**
 * The pre-search landing content: location prompt, popular-service
 * shortcuts, and the "browse every clinic" fallback.
 */
export function SearchLanding({
  serviceOptions,
  selectedServices,
  onToggleService,
  onOpenMore,
  onLocated,
  onDenied,
  onBrowseAll,
}: {
  serviceOptions: { slug: string; name: string }[];
  selectedServices: string[];
  onToggleService: (slug: string) => void;
  onOpenMore: () => void;
  onLocated: (result: GeoResult) => void;
  onDenied: () => void;
  onBrowseAll: () => void;
}) {
  const shortcuts = serviceOptions.slice(0, SHORTCUT_COUNT);

  return (
    <>
      <LocationPermissionPrompt onLocated={onLocated} onDenied={onDenied} />
      {shortcuts.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted-foreground">
            Popular services
          </p>
          <ul className="flex flex-wrap gap-2" aria-label="Services">
            {shortcuts.map((service) => (
              <li key={service.slug}>
                <ServiceChip
                  label={service.name}
                  pressed={selectedServices.includes(service.slug)}
                  onClick={() => onToggleService(service.slug)}
                />
              </li>
            ))}
            {serviceOptions.length > SHORTCUT_COUNT && (
              <li>
                <ServiceChip label="More" more onClick={onOpenMore} />
              </li>
            )}
          </ul>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        Or{" "}
        <button
          type="button"
          className="rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={onBrowseAll}
        >
          browse every clinic
        </button>
        .
      </p>
    </>
  );
}
