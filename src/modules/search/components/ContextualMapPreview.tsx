"use client";

import { useReducedMotion } from "@/lib/reduced-motion";
import { AnimatePresence, m, useIsPresent } from "motion/react";
import type { ClinicPreviewData } from "./ClinicPreview";
import { ClinicPreview } from "./ClinicPreview";
import {
  SEARCH_PREVIEW_EXIT_TRANSITION,
  SEARCH_PREVIEW_TRANSITION,
} from "../motion";

interface ContextualMapPreviewProps {
  preview: ClinicPreviewData | null;
  onClose: () => void;
}

function MapPreview({
  preview,
  onClose,
  reduced,
}: {
  preview: ClinicPreviewData;
  onClose: () => void;
  reduced: boolean;
}) {
  const isPresent = useIsPresent();

  return (
    <m.div
      data-slot="contextual-map-preview"
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: SEARCH_PREVIEW_EXIT_TRANSITION }}
      transition={reduced ? { duration: 0 } : SEARCH_PREVIEW_TRANSITION}
      inert={!isPresent}
      aria-hidden={isPresent ? undefined : true}
      style={{ pointerEvents: isPresent ? undefined : "none" }}
      className="absolute inset-x-3 bottom-3 z-10 hidden md:block"
    >
      <ClinicPreview
        clinic={preview}
        variant="map"
        onClose={onClose}
        className="max-h-[45dvh] overflow-y-auto shadow-soft"
      />
    </m.div>
  );
}

export function ContextualMapPreview({
  preview,
  onClose,
}: ContextualMapPreviewProps) {
  const reduced = useReducedMotion();
  const previewNode = preview ? (
    <MapPreview
      key={preview.id}
      preview={preview}
      onClose={onClose}
      reduced={reduced}
    />
  ) : null;

  if (reduced) return previewNode;

  return (
    <AnimatePresence initial={false} mode="wait">
      {previewNode}
    </AnimatePresence>
  );
}
