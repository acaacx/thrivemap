"use client";

import { useCallback, useId, useSyncExternalStore } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_DISPLAY_PREFS,
  DISPLAY_PREFS_STORAGE_KEY,
  DISPLAY_PREF_KEYS,
  DISPLAY_PREF_LABELS,
  type DisplayPrefKey,
  type DisplayPrefs,
  applyDisplayPrefs,
  readDisplayPrefs,
  writeDisplayPrefs,
} from "@/lib/display-prefs";

/**
 * Small, optional sensory controls. Deliberately not a full accessibility
 * panel — four switches, plain labels, nothing animated. State is mirrored
 * to <html data-*> and persisted; the root layout's boot script re-applies
 * it before paint on the next visit.
 */
const CHANGE_EVENT = "tm-display-change";

// Snapshot cache so useSyncExternalStore gets a stable reference until the
// stored value actually changes.
let cachedRaw: string | null | undefined;
let cachedPrefs: DisplayPrefs = DEFAULT_DISPLAY_PREFS;

function getSnapshot(): DisplayPrefs {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(DISPLAY_PREFS_STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedPrefs = readDisplayPrefs();
  }
  return cachedPrefs;
}

function getServerSnapshot(): DisplayPrefs {
  return DEFAULT_DISPLAY_PREFS;
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function DisplayPreferences({ className }: { className?: string }) {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const baseId = useId();

  const toggle = useCallback(
    (key: DisplayPrefKey, value: boolean) => {
      const next = { ...prefs, [key]: value };
      applyDisplayPrefs(next);
      writeDisplayPrefs(next);
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [prefs],
  );

  const activeCount = DISPLAY_PREF_KEYS.filter((k) => prefs[k]).length;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            className={className}
            aria-label={
              activeCount > 0
                ? `Display preferences, ${activeCount} on`
                : "Display preferences"
            }
          />
        }
      >
        <SlidersHorizontal aria-hidden />
        Display
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-4 p-4">
        <PopoverHeader>
          <PopoverTitle className="text-base font-semibold">
            Display preferences
          </PopoverTitle>
          <PopoverDescription>
            Adjust how ThriveMap looks. Saved on this device only.
          </PopoverDescription>
        </PopoverHeader>
        <ul className="flex flex-col divide-y">
          {DISPLAY_PREF_KEYS.map((key) => {
            const id = `${baseId}-${key}`;
            const { label, hint } = DISPLAY_PREF_LABELS[key];
            return (
              <li
                key={key}
                className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <Label
                  htmlFor={id}
                  className="flex flex-col items-start gap-0.5 text-left"
                >
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {hint}
                  </span>
                </Label>
                <Switch
                  id={id}
                  checked={prefs[key]}
                  onCheckedChange={(checked) => toggle(key, checked)}
                />
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
