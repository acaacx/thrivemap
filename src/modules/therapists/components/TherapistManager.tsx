"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  IMAGE_UPLOAD_ACCEPT,
  IMAGE_UPLOAD_MAX_BYTES,
  IMAGE_UPLOAD_MIME,
} from "@/modules/portal/schemas";
import {
  createTherapist,
  deleteTherapist,
  moveTherapist,
  removeTherapistPhoto,
  setTherapistPhoto,
  updateTherapist,
} from "../actions";
import { initials } from "../lib";
import type { TherapistInput } from "../schemas";
import { TherapistForm } from "./TherapistForm";

interface TherapistRow {
  id: string;
  full_name: string;
  credentials: string | null;
  profession: string;
  specialties: string[];
  bio: string | null;
  photo_path: string | null;
  display_order: number;
  created_at: string;
}

interface TherapistManagerProps {
  clinicId: string;
  therapists: TherapistRow[];
}

export function TherapistManager({
  clinicId,
  therapists,
}: TherapistManagerProps) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);
  const supabase = createSupabaseBrowserClient();

  const ordered = [...therapists].sort(
    (a, b) =>
      a.display_order - b.display_order ||
      a.created_at.localeCompare(b.created_at),
  );

  function photoUrl(path: string) {
    return supabase.storage.from("clinic-images").getPublicUrl(path).data
      .publicUrl;
  }

  async function withBusy(
    id: string,
    fn: () => Promise<{ error?: string; message?: string }>,
  ) {
    setFeedback(null);
    setBusyId(id);
    try {
      const result = await fn();
      if (result.error) {
        setFeedback({ kind: "error", text: result.error });
      } else {
        setFeedback({ kind: "ok", text: result.message ?? "Saved." });
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function onUploadPhoto(
    therapistId: string,
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFeedback(null);
    if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
      setFeedback({ kind: "error", text: "Photos must be 5 MB or smaller." });
      return;
    }
    if (!IMAGE_UPLOAD_MIME.includes(file.type)) {
      setFeedback({ kind: "error", text: "Upload a JPG, PNG, or WebP image." });
      return;
    }
    setBusyId(therapistId);
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
      const path = `${clinicId}/therapists/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("clinic-images")
        .upload(path, file, { contentType: file.type });
      if (uploadError) {
        console.error("therapist photo upload failed:", uploadError.message);
        setFeedback({
          kind: "error",
          text: "Upload failed. Please try again.",
        });
        return;
      }
      const result = await setTherapistPhoto(clinicId, {
        therapist_id: therapistId,
        storage_path: path,
      });
      if (result.error) {
        setFeedback({ kind: "error", text: result.error });
      } else {
        setFeedback({ kind: "ok", text: result.message ?? "Photo updated." });
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      {feedback && (
        <p
          role={feedback.kind === "error" ? "alert" : "status"}
          className={`rounded-lg border px-4 py-3 text-sm ${
            feedback.kind === "error"
              ? "border-destructive/40 bg-destructive/10"
              : "border-success/40 bg-success-subtle"
          }`}
        >
          {feedback.text}
        </p>
      )}

      {adding ? (
        <div className="rounded-xl border bg-card p-4">
          <TherapistForm
            submitLabel="Add team member"
            onCancel={() => setAdding(false)}
            onSubmit={async (values: TherapistInput) => {
              const result = await createTherapist(clinicId, values);
              if (!result.error) {
                setAdding(false);
                setFeedback({
                  kind: "ok",
                  text: result.message ?? "Team member added.",
                });
                router.refresh();
              }
              return result;
            }}
          />
        </div>
      ) : (
        <Button onClick={() => setAdding(true)}>Add a team member</Button>
      )}

      {ordered.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground">
          No team members listed yet. Families searching for specific therapy
          types can find you more easily once your team is listed.
        </p>
      ) : (
        <ul className="space-y-3">
          {ordered.map((therapist, index) => (
            <li key={therapist.id} className="rounded-xl border bg-card p-4">
              {editingId === therapist.id ? (
                <TherapistForm
                  initial={{
                    full_name: therapist.full_name,
                    credentials: therapist.credentials ?? "",
                    profession: therapist.profession,
                    specialties: therapist.specialties,
                    bio: therapist.bio ?? "",
                  }}
                  submitLabel="Save changes"
                  onCancel={() => setEditingId(null)}
                  onSubmit={async (values: TherapistInput) => {
                    const result = await updateTherapist(
                      clinicId,
                      therapist.id,
                      values,
                    );
                    if (!result.error) {
                      setEditingId(null);
                      setFeedback({
                        kind: "ok",
                        text: result.message ?? "Changes published.",
                      });
                      router.refresh();
                    }
                    return result;
                  }}
                />
              ) : (
                <div className="flex flex-wrap items-start gap-3">
                  <div className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary">
                    {therapist.photo_path ? (
                      <Image
                        src={photoUrl(therapist.photo_path)}
                        alt=""
                        fill
                        sizes="48px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <span aria-hidden className="text-sm font-medium">
                        {initials(therapist.full_name)}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {therapist.full_name}
                      {therapist.credentials && (
                        <span className="text-muted-foreground">
                          , {therapist.credentials}
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {therapist.profession}
                      {therapist.specialties.length > 0 &&
                        ` — ${therapist.specialties.join(", ")}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Move ${therapist.full_name} up`}
                      disabled={index === 0 || busyId !== null}
                      onClick={() =>
                        withBusy(therapist.id, () =>
                          moveTherapist(clinicId, {
                            therapist_id: therapist.id,
                            direction: "up",
                          }),
                        )
                      }
                    >
                      <ArrowUp aria-hidden className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Move ${therapist.full_name} down`}
                      disabled={index === ordered.length - 1 || busyId !== null}
                      onClick={() =>
                        withBusy(therapist.id, () =>
                          moveTherapist(clinicId, {
                            therapist_id: therapist.id,
                            direction: "down",
                          }),
                        )
                      }
                    >
                      <ArrowDown aria-hidden className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Edit ${therapist.full_name}`}
                      disabled={busyId !== null}
                      onClick={() => setEditingId(therapist.id)}
                    >
                      <Pencil aria-hidden className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      aria-label={`Remove ${therapist.full_name}`}
                      disabled={busyId !== null}
                      onClick={() =>
                        withBusy(therapist.id, () =>
                          deleteTherapist(clinicId, therapist.id),
                        )
                      }
                    >
                      {busyId === therapist.id ? (
                        <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 aria-hidden className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <div className="flex w-full flex-wrap items-center gap-2 pt-1">
                    <label
                      className="text-sm text-muted-foreground"
                      htmlFor={`photo-${therapist.id}`}
                    >
                      Photo:
                    </label>
                    <Input
                      id={`photo-${therapist.id}`}
                      className="max-w-64"
                      type="file"
                      accept={IMAGE_UPLOAD_ACCEPT}
                      disabled={busyId !== null}
                      onChange={(e) => onUploadPhoto(therapist.id, e)}
                    />
                    {therapist.photo_path && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId !== null}
                        onClick={() =>
                          withBusy(therapist.id, () =>
                            removeTherapistPhoto(clinicId, therapist.id),
                          )
                        }
                      >
                        Remove photo
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
