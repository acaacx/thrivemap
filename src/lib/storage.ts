/**
 * Public URL for an object in a public Supabase Storage bucket. Server-safe
 * (no supabase client import) — usable from server components.
 *
 * Each path segment is percent-encoded independently so `/` separators are
 * preserved while special characters within a segment (spaces, `#`, `?`, …)
 * are escaped.
 */
export function publicStorageUrl(bucket: string, path: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${base}/storage/v1/object/public/${bucket}/${encodedPath}`;
}
