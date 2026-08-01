/**
 * Opaque keyset-pagination cursor: base64url of { v, id } where `v` is the
 * sort value (distance km or rank) of the last row and `id` its clinic id.
 */

export interface SearchCursor {
  v: number;
  id: string;
}

export function encodeCursor(cursor: SearchCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeCursor(raw: string | undefined): SearchCursor | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    );
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as SearchCursor).v === "number" &&
      Number.isFinite((parsed as SearchCursor).v) &&
      typeof (parsed as SearchCursor).id === "string" &&
      /^[0-9a-f-]{36}$/.test((parsed as SearchCursor).id)
    ) {
      return parsed as SearchCursor;
    }
    return null;
  } catch {
    return null;
  }
}
