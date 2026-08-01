"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { deleteClinicImage, recordClinicImage } from "../actions";
import {
  IMAGE_UPLOAD_ACCEPT,
  IMAGE_UPLOAD_MAX_BYTES,
  IMAGE_UPLOAD_MIME,
} from "../schemas";

interface ClinicImage {
  id: string;
  storage_path: string;
  alt_text: string;
  kind: string;
}

interface PortalImagesManagerProps {
  clinicId: string;
  images: ClinicImage[];
}

export function PortalImagesManager({
  clinicId,
  images,
}: PortalImagesManagerProps) {
  const router = useRouter();
  const [altText, setAltText] = useState("");
  const [kind, setKind] = useState<"gallery" | "logo" | "cover">("gallery");
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const supabase = createSupabaseBrowserClient();

  function publicUrl(path: string) {
    return supabase.storage.from("clinic-images").getPublicUrl(path).data
      .publicUrl;
  }

  async function onUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
      setError("Images must be 5 MB or smaller.");
      return;
    }
    if (!IMAGE_UPLOAD_MIME.includes(file.type)) {
      setError("Upload a JPG, PNG, or WebP image.");
      return;
    }
    if (!altText.trim()) {
      setError(
        "Describe the image first (alt text) — it helps screen-reader users.",
      );
      return;
    }
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
      const path = `${clinicId}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("clinic-images")
        .upload(path, file, { contentType: file.type });
      if (uploadError) {
        console.error("clinic image upload failed:", uploadError.message);
        setError("Upload failed. Please try again.");
        return;
      }
      const result = await recordClinicImage({
        clinic_id: clinicId,
        storage_path: path,
        alt_text: altText.trim(),
        kind,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setAltText("");
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  async function onDelete(imageId: string) {
    setError(null);
    setRemoving(imageId);
    try {
      const result = await deleteClinicImage(clinicId, imageId);
      if (result.error) setError(result.error);
      else router.refresh();
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
        >
          {error}
        </p>
      )}

      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-52 flex-1 space-y-1.5">
            <Label htmlFor="image-alt">Image description (alt text)</Label>
            <Input
              id="image-alt"
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              placeholder="e.g. Sensory-friendly waiting area"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="image-kind">Type</Label>
            <select
              id="image-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="gallery">Gallery</option>
              <option value="logo">Logo</option>
              <option value="cover">Cover</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="image-file">Image (max 5 MB)</Label>
            <Input
              id="image-file"
              type="file"
              accept={IMAGE_UPLOAD_ACCEPT}
              onChange={onUpload}
              disabled={uploading}
            />
          </div>
          {uploading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" />{" "}
              Uploading…
            </p>
          )}
        </div>
      </div>

      {images.length === 0 ? (
        <p className="text-sm text-muted-foreground">No images yet.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((image) => (
            <li
              key={image.id}
              className="overflow-hidden rounded-xl border bg-card"
            >
              <div className="relative aspect-[4/3] bg-muted">
                <Image
                  src={publicUrl(image.storage_path)}
                  alt={image.alt_text}
                  fill
                  sizes="(max-width: 640px) 100vw, 33vw"
                  className="object-cover"
                  unoptimized
                />
              </div>
              <div className="flex items-center gap-2 p-3 text-sm">
                <span className="min-w-0 truncate text-muted-foreground">
                  {image.alt_text || image.kind}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-destructive"
                  disabled={removing === image.id}
                  onClick={() => onDelete(image.id)}
                  aria-label={`Remove image: ${image.alt_text || image.kind}`}
                >
                  {removing === image.id ? (
                    <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 aria-hidden className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
