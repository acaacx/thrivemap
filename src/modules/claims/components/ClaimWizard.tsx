"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { CheckCircle2, FileText, Loader2, ShieldCheck, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  recordClaimDocument,
  saveClaimDetails,
  startClaim,
  submitClaim,
} from "../actions";
import {
  CLAIM_DOCUMENT_KINDS,
  CLAIM_RELATIONSHIPS,
  CLAIM_UPLOAD_ACCEPT,
  CLAIM_UPLOAD_MAX_BYTES,
  CLAIM_UPLOAD_MIME,
  claimDetailsSchema,
  type ClaimDetailsInput,
  type ClaimDocumentKind,
} from "../schemas";

interface ClaimDoc {
  id: string;
  kind: string;
  original_filename: string | null;
}

interface InitialClaim {
  id: string;
  status: string;
  full_name: string;
  work_email: string;
  mobile_number: string;
  job_title: string;
  relationship: string;
  business_registration_info: string | null;
  additional_info_request: string | null;
  decision_reason: string | null;
  clinic_claim_documents: ClaimDoc[];
}

interface ClaimWizardProps {
  clinic: { id: string; name: string; slug: string };
  userId: string;
  initialClaim: InitialClaim | null;
}

type Step = "details" | "documents" | "review";

const STEPS: { id: Step; label: string }[] = [
  { id: "details", label: "Your details" },
  { id: "documents", label: "Verification documents" },
  { id: "review", label: "Review & submit" },
];

function kindLabel(kind: string) {
  return CLAIM_DOCUMENT_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

export function ClaimWizard({ clinic, userId, initialClaim }: ClaimWizardProps) {
  const router = useRouter();
  const editable =
    !initialClaim ||
    initialClaim.status === "draft" ||
    initialClaim.status === "additional_information_required";

  const [claimId, setClaimId] = useState<string | null>(initialClaim?.id ?? null);
  const [step, setStep] = useState<Step>("details");
  const [docs, setDocs] = useState<ClaimDoc[]>(initialClaim?.clinic_claim_documents ?? []);
  const [docKind, setDocKind] = useState<ClaimDocumentKind>("proof_of_affiliation");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [consent, setConsent] = useState(false);

  const isKnownRelationship = (CLAIM_RELATIONSHIPS as readonly string[]).includes(
    initialClaim?.relationship ?? "",
  );
  const form = useForm<ClaimDetailsInput>({
    resolver: zodResolver(claimDetailsSchema),
    defaultValues: {
      full_name: initialClaim?.full_name ?? "",
      work_email: initialClaim?.work_email ?? "",
      mobile_number: initialClaim?.mobile_number ?? "",
      job_title: initialClaim?.job_title ?? "",
      relationship: (isKnownRelationship
        ? initialClaim?.relationship
        : undefined) as ClaimDetailsInput["relationship"],
      business_registration_info: initialClaim?.business_registration_info ?? "",
    },
  });

  if (done) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-[var(--verified)]/40 bg-[var(--verified)]/10 p-8 text-center"
      >
        <ShieldCheck aria-hidden className="mx-auto h-10 w-10 text-[var(--verified)]" />
        <p className="mt-3 font-heading text-xl font-semibold">Claim submitted</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Our moderators will review your claim and documents. You can follow its
          status from your account.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button className="rounded-full" render={<Link href="/account/claims" />}>
            View my claims
          </Button>
          <Button
            variant="outline"
            className="rounded-full"
            render={<Link href={`/clinics/${clinic.slug}`} />}
          >
            Back to listing
          </Button>
        </div>
      </div>
    );
  }

  if (initialClaim && !editable) {
    const statusCopy: Record<string, string> = {
      submitted: "Your claim is in the moderation queue.",
      under_review: "A moderator is reviewing your claim right now.",
      approved:
        "Your claim was approved — you can manage this clinic from the clinic portal.",
    };
    return (
      <div className="rounded-2xl border bg-card p-8">
        <p className="font-heading text-xl font-semibold">
          Claim status: {initialClaim.status.replaceAll("_", " ")}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {statusCopy[initialClaim.status] ?? "We'll email you when there's an update."}
        </p>
        <div className="mt-6 flex gap-3">
          {initialClaim.status === "approved" ? (
            <Button className="rounded-full" render={<Link href="/clinic-portal" />}>
              Open clinic portal
            </Button>
          ) : (
            <Button className="rounded-full" render={<Link href="/account/claims" />}>
              View my claims
            </Button>
          )}
        </div>
      </div>
    );
  }

  async function ensureClaimId(): Promise<string | null> {
    if (claimId) return claimId;
    const result = await startClaim(clinic.id);
    if (result.error || !result.claimId) {
      setError(result.error ?? "Could not start the claim.");
      return null;
    }
    setClaimId(result.claimId);
    return result.claimId;
  }

  async function onDetailsNext(values: ClaimDetailsInput) {
    setError(null);
    setBusy(true);
    try {
      const id = await ensureClaimId();
      if (!id) return;
      const result = await saveClaimDetails(id, values);
      if (result.error) {
        setError(result.error);
        return;
      }
      setStep("documents");
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !claimId) return;
    setError(null);
    if (file.size > CLAIM_UPLOAD_MAX_BYTES) {
      setError("Files must be 10 MB or smaller.");
      return;
    }
    if (!CLAIM_UPLOAD_MIME.includes(file.type)) {
      setError("Upload a PDF or an image (JPG, PNG, WebP).");
      return;
    }
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
      const path = `${userId}/${claimId}/${crypto.randomUUID()}-${safeName}`;
      const supabase = createSupabaseBrowserClient();
      const { error: uploadError } = await supabase.storage
        .from("claim-documents")
        .upload(path, file, { contentType: file.type });
      if (uploadError) {
        console.error("claim upload failed:", uploadError.message);
        setError("Upload failed. Please try again.");
        return;
      }
      const result = await recordClaimDocument({
        claim_id: claimId,
        storage_path: path,
        kind: docKind,
        original_filename: file.name,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setDocs((current) => [
        ...current,
        { id: path, kind: docKind, original_filename: file.name },
      ]);
    } finally {
      setUploading(false);
    }
  }

  async function onSubmitClaim() {
    if (!claimId || !consent) return;
    setError(null);
    setBusy(true);
    try {
      const result = await submitClaim(claimId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDone(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const values = form.watch();

  return (
    <div className="space-y-6">
      {initialClaim?.status === "additional_information_required" && (
        <div className="rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm">
          <p className="font-medium">More information requested</p>
          <p className="mt-1 text-muted-foreground">
            {initialClaim.additional_info_request ??
              "A moderator asked for more details. Update your claim and resubmit."}
          </p>
        </div>
      )}

      <ol aria-label="Claim steps" className="flex flex-wrap gap-2 text-sm">
        {STEPS.map((s, index) => {
          const isCurrent = s.id === step;
          const isDone = STEPS.findIndex((x) => x.id === step) > index;
          return (
            <li
              key={s.id}
              aria-current={isCurrent ? "step" : undefined}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 ${
                isCurrent
                  ? "border-primary bg-primary text-primary-foreground"
                  : isDone
                    ? "border-[var(--verified)]/50 text-foreground"
                    : "text-muted-foreground"
              }`}
            >
              {isDone && (
                <CheckCircle2 aria-hidden className="h-3.5 w-3.5 text-[var(--verified)]" />
              )}
              {index + 1}. {s.label}
            </li>
          );
        })}
      </ol>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          {error}
        </p>
      )}

      {step === "details" && (
        <form onSubmit={form.handleSubmit(onDetailsNext)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="claim-name">Full name</Label>
              <Input id="claim-name" autoComplete="name" {...form.register("full_name")} />
              <FieldError message={form.formState.errors.full_name?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="claim-email">Work email</Label>
              <Input
                id="claim-email"
                type="email"
                autoComplete="email"
                {...form.register("work_email")}
              />
              <FieldError message={form.formState.errors.work_email?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="claim-mobile">Mobile number</Label>
              <Input
                id="claim-mobile"
                type="tel"
                autoComplete="tel"
                placeholder="+63 917 000 0000"
                {...form.register("mobile_number")}
              />
              <FieldError message={form.formState.errors.mobile_number?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="claim-title">Job title</Label>
              <Input id="claim-title" {...form.register("job_title")} />
              <FieldError message={form.formState.errors.job_title?.message} />
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Relationship to the clinic</legend>
            <div className="flex flex-wrap gap-2">
              {CLAIM_RELATIONSHIPS.map((relationship) => (
                <label
                  key={relationship}
                  className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${
                    values.relationship === relationship
                      ? "border-primary bg-primary/10"
                      : "hover:border-primary/40"
                  }`}
                >
                  <input
                    type="radio"
                    value={relationship}
                    className="sr-only"
                    {...form.register("relationship")}
                  />
                  {relationship}
                </label>
              ))}
            </div>
            <FieldError message={form.formState.errors.relationship?.message} />
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="claim-registration">
              Business registration details{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="claim-registration"
              rows={3}
              placeholder="e.g. DTI/SEC registration number"
              {...form.register("business_registration_info")}
            />
            <FieldError
              message={form.formState.errors.business_registration_info?.message}
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" className="rounded-full" disabled={busy}>
              {busy && <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />}
              Continue to documents
            </Button>
          </div>
        </form>
      )}

      {step === "documents" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Attach at least one document that shows your affiliation with{" "}
            <span className="font-medium text-foreground">{clinic.name}</span> — a
            business permit, employment record, or similar. Documents are stored
            privately and only visible to our verification team.
          </p>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="claim-doc-kind">Document type</Label>
                <select
                  id="claim-doc-kind"
                  value={docKind}
                  onChange={(e) => setDocKind(e.target.value as ClaimDocumentKind)}
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                >
                  {CLAIM_DOCUMENT_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="claim-doc-file">File (PDF or image, max 10 MB)</Label>
                <Input
                  id="claim-doc-file"
                  type="file"
                  accept={CLAIM_UPLOAD_ACCEPT}
                  onChange={onUpload}
                  disabled={uploading}
                />
              </div>
              {uploading && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Uploading…
                </p>
              )}
            </div>
          </div>
          {docs.length > 0 ? (
            <ul className="space-y-2">
              {docs.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5 text-sm"
                >
                  <FileText aria-hidden className="h-4 w-4 text-primary" />
                  <span className="min-w-0 truncate">{doc.original_filename}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {kindLabel(doc.kind)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Upload aria-hidden className="h-4 w-4" /> No documents attached yet.
            </p>
          )}
          <div className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => setStep("details")}
            >
              Back
            </Button>
            <Button
              type="button"
              className="rounded-full"
              disabled={docs.length === 0}
              onClick={() => setStep("review")}
            >
              Continue to review
            </Button>
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="space-y-4">
          <dl className="grid gap-3 rounded-xl border bg-card p-5 text-sm sm:grid-cols-2">
            <ReviewItem label="Full name" value={values.full_name} />
            <ReviewItem label="Work email" value={values.work_email} />
            <ReviewItem label="Mobile" value={values.mobile_number} />
            <ReviewItem label="Job title" value={values.job_title} />
            <ReviewItem label="Relationship" value={values.relationship} />
            <ReviewItem
              label="Documents"
              value={`${docs.length} attached`}
            />
          </dl>
          <label className="flex items-start gap-3 rounded-xl border bg-card p-4 text-sm">
            <Checkbox
              checked={consent}
              onCheckedChange={(checked) => setConsent(checked === true)}
              aria-label="Consent to verification"
            />
            <span>
              I confirm I am authorized to represent {clinic.name}, the information
              I provided is accurate, and I consent to ThriveMap verifying it —
              including contacting the clinic directly.
            </span>
          </label>
          <div className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => setStep("documents")}
            >
              Back
            </Button>
            <Button
              type="button"
              className="rounded-full"
              disabled={!consent || busy}
              onClick={onSubmitClaim}
            >
              {busy && <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />}
              Submit claim
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value || "—"}</dd>
    </div>
  );
}
