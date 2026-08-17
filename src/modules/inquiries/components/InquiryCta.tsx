"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createInquiryAction } from "../actions";

// Native date input on purpose: Playwright drives it far more reliably than
// a Base UI date picker. Styled to match Input's classes for visual parity.
const DATE_INPUT_CLASSES =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80";

/**
 * Signed-in state, resolved client-side. `accepts` is server-derived and
 * clinic-scoped (not user-specific), so it can be passed in as a prop from
 * an ISR page — but auth state can't, without forcing that page dynamic.
 * Mirrors FavoriteButton's useFavorites().
 */
function useSignedIn() {
  return useQuery<{ signedIn: boolean }>({
    queryKey: ["inquiries-session"],
    queryFn: async () => {
      const res = await fetch("/api/inquiries/session");
      if (!res.ok) throw new Error("session fetch failed");
      return res.json();
    },
    staleTime: 60_000,
  });
}

export function InquiryCta({
  clinicId,
  clinicName,
  clinicSlug,
  accepts,
}: {
  clinicId: string;
  clinicName: string;
  clinicSlug: string;
  accepts: boolean;
}) {
  const router = useRouter();
  const { data: session } = useSignedIn();
  const signedIn = session?.signedIn ?? false;
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTimeNote, setPreferredTimeNote] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const result = await createInquiryAction({
        clinicId,
        subject,
        body,
        preferredDate,
        preferredTimeNote,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Inquiry sent.");
      setOpen(false);
      setSubject("");
      setBody("");
      setPreferredDate("");
      setPreferredTimeNote("");
      if (result.inquiryId) {
        router.push(`/account/inquiries/${result.inquiryId}`);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">
          <h2>Contact this clinic</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!signedIn && (
          <p className="text-muted-foreground">
            <Link
              href="/login"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Sign in to send an inquiry
            </Link>
          </p>
        )}
        {signedIn && !accepts && (
          <p className="text-muted-foreground">
            This clinic hasn&apos;t been claimed yet, so it can&apos;t receive
            inquiries.{" "}
            <Link
              href={`/clinics/${clinicSlug}/claim`}
              className="underline underline-offset-4 hover:text-foreground"
            >
              Represent this clinic? Claim it.
            </Link>
          </p>
        )}
        {signedIn && accepts && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button />}>Send an inquiry</DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Send an inquiry to {clinicName}</DialogTitle>
              </DialogHeader>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="inquiry-subject">Subject</Label>
                  <Input
                    id="inquiry-subject"
                    name="subject"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    maxLength={200}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inquiry-body">Message</Label>
                  <Textarea
                    id="inquiry-body"
                    name="body"
                    rows={4}
                    maxLength={4000}
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="inquiry-preferred-date">
                      Preferred date
                    </Label>
                    <input
                      id="inquiry-preferred-date"
                      name="preferredDate"
                      type="date"
                      value={preferredDate}
                      onChange={(event) => setPreferredDate(event.target.value)}
                      className={DATE_INPUT_CLASSES}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="inquiry-time-note">Time note</Label>
                    <Input
                      id="inquiry-time-note"
                      name="preferredTimeNote"
                      placeholder="e.g. weekday mornings"
                      value={preferredTimeNote}
                      onChange={(event) =>
                        setPreferredTimeNote(event.target.value)
                      }
                      maxLength={200}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={pending}>
                    {pending && (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    )}
                    Send inquiry
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}
