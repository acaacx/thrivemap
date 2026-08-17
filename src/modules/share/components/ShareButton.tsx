"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Shares the current filtered URL. The OG card only pays off if caregivers
 * actually paste these links into group threads, and on mobile the native
 * share sheet is the path of least resistance.
 *
 * navigator.share is unavailable on most desktop browsers and throws
 * AbortError when the user dismisses the sheet — neither is an error worth
 * showing.
 */
export function ShareButton({
  label = "Share these results",
}: {
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: document.title, url });
        return;
      } catch (error) {
        // Dismissing the sheet is a normal outcome, not a failure.
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context, or permission denied). Say
      // nothing rather than showing an error for a nice-to-have.
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="rounded-full"
      onClick={share}
    >
      <Share2 className="size-4" aria-hidden />
      {copied ? "Link copied" : label}
    </Button>
  );
}
