"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runDuplicateScanAction } from "../actions";

/** Runs the duplicate-detection scan on demand and refreshes the workspace. */
export function ScanButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onScan() {
    setMessage(null);
    setBusy(true);
    try {
      const result = await runDuplicateScanAction();
      setMessage(result.error ?? result.message ?? null);
      if (!result.error) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {message && (
        <span role="status" className="text-xs text-muted-foreground">
          {message}
        </span>
      )}
      <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={onScan}>
        {busy ? (
          <Loader2 aria-hidden className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : (
          <ScanSearch aria-hidden className="mr-2 h-3.5 w-3.5" />
        )}
        Run scan
      </Button>
    </div>
  );
}
