/**
 * Opaque keyset-pagination cursor: base64url of { v, id } where `v` is the
 * sort key of the last row of the previous page and `id` its clinic id.
 *
 * `v` is a number for the numeric sorts (distance, relevance rank, verified
 * flag, verification recency) and a string for `alphabetical`, which keys on
 * the clinic name. `search_clinics` emits the key it sorted by, so callers
 * never recompute it.
 */

export interface SearchCursor {
  v: number | string;
  id: string;
}

/** Bound on the text key so a forged cursor cannot carry a huge payload. */
const MAX_TEXT_KEY = 200;

export function encodeCursor(cursor: SearchCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeCursor(raw: string | undefined): SearchCursor | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    );
    if (typeof parsed !== "object" || parsed === null) return null;
    const { v, id } = parsed as SearchCursor;
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) return null;
    if (typeof v === "number" && Number.isFinite(v)) return { v, id };
    if (typeof v === "string" && v.length <= MAX_TEXT_KEY) return { v, id };
    return null;
  } catch {
    return null;
  }
}
