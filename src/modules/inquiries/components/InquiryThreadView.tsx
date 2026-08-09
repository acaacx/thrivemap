"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { InquiryThread } from "../queries";
import { replyInquiryAction } from "../actions";
import { INQUIRY_STATUS_LABELS } from "../schemas";
import { ReportInquiryDialog } from "./ReportInquiryDialog";

const CLOSED_STATUSES = new Set(["declined", "closed"]);

function formatMessageDate(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Date-only columns ("2026-08-15") — parse as UTC so the calendar day never
// shifts with the viewer's timezone.
function formatDateOnly(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-PH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function InquiryThreadView({
  thread,
  children,
}: {
  thread: InquiryThread;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const closed = CLOSED_STATUSES.has(thread.status);

  async function onReply(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const result = await replyInquiryAction({
        inquiryId: thread.id,
        body,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Reply sent.");
      setBody("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-4">
        <div className="min-w-0 space-y-1.5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{INQUIRY_STATUS_LABELS[thread.status]}</Badge>
            <h1 className="font-heading text-lg font-semibold">
              {thread.subject}
            </h1>
          </div>
          {thread.confirmedDate && (
            <p className="text-muted-foreground">
              Confirmed for {formatDateOnly(thread.confirmedDate)}
            </p>
          )}
          {(thread.preferredDate || thread.preferredTimeNote) && (
            <p className="text-muted-foreground">
              Preferred:{" "}
              {[
                thread.preferredDate && formatDateOnly(thread.preferredDate),
                thread.preferredTimeNote,
              ]
                .filter(Boolean)
                .join(" — ")}
            </p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" />}
          >
            <MoreVertical className="size-4" aria-hidden />
            <span className="sr-only">More actions</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setReportOpen(true)}>
              Report this conversation
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {children}

      <div className="space-y-3">
        {thread.messages.map((message) => {
          const fromCaregiver = message.senderRole === "caregiver";
          return (
            <div
              key={message.id}
              className={`flex ${fromCaregiver ? "justify-end" : "justify-start"}`}
            >
              <div
                aria-label={
                  fromCaregiver
                    ? "Message from caregiver"
                    : "Message from clinic"
                }
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                  fromCaregiver ? "bg-primary/10" : "border bg-card"
                }`}
              >
                <p className="whitespace-pre-line">{message.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatMessageDate(message.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {closed ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          This conversation is closed.
        </p>
      ) : (
        <form onSubmit={onReply} className="space-y-2">
          <Label htmlFor="inquiry-reply-body" className="sr-only">
            Your reply
          </Label>
          <Textarea
            id="inquiry-reply-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write a reply…"
            rows={3}
            maxLength={4000}
            required
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={pending || !body.trim()}>
              {pending && (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              )}
              Send reply
            </Button>
          </div>
        </form>
      )}

      <ReportInquiryDialog
        inquiryId={thread.id}
        open={reportOpen}
        onOpenChange={setReportOpen}
      />
    </div>
  );
}
