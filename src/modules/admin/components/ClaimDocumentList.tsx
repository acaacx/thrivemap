"use client";

import { useState } from "react";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getClaimDocumentUrl } from "../actions";

interface ClaimDocumentListProps {
  documents: { id: string; kind: string; original_filename: string | null }[];
}

/** Verification documents open via short-lived signed URLs; every view is audited. */
export function ClaimDocumentList({ documents }: ClaimDocumentListProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onOpen(documentId: string) {
    setError(null);
    setBusyId(documentId);
    try {
      const result = await getClaimDocumentUrl(documentId);
      if (result.error || !result.url) {
        setError(result.error ?? "Could not open the document.");
        return;
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
    } finally {
      setBusyId(null);
    }
  }

  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground">No documents attached.</p>;
  }

  return (
    <div className="space-y-2">
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          {error}
        </p>
      )}
      <ul className="space-y-2">
        {documents.map((doc) => (
          <li
            key={doc.id}
            className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <FileText aria-hidden className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 truncate">{doc.original_filename ?? doc.kind}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {doc.kind.replaceAll("_", " ")}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto shrink-0 rounded-full"
              disabled={busyId !== null}
              onClick={() => onOpen(doc.id)}
            >
              {busyId === doc.id ? (
                <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ExternalLink aria-hidden className="mr-1.5 h-3.5 w-3.5" />
              )}
              View (audited)
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
