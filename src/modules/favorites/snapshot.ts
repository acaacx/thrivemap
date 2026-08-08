export const SNAPSHOT_KEY = "thrivemap.favorites-snapshot";
export const SNAPSHOT_VERSION = 1;

export interface SnapshotItem {
  slug: string;
  name: string;
  address: string;
  phone: string | null;
}

export function writeSnapshot(items: SnapshotItem[]): void {
  try {
    localStorage.setItem(
      SNAPSHOT_KEY,
      JSON.stringify({ version: SNAPSHOT_VERSION, savedAt: new Date().toISOString(), items }),
    );
  } catch {
    // Private mode / quota — offline snapshot is best-effort.
  }
}

export function readSnapshot(): SnapshotItem[] | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" || parsed === null ||
      (parsed as { version?: unknown }).version !== SNAPSHOT_VERSION ||
      !Array.isArray((parsed as { items?: unknown }).items)
    )
      return null;
    return (parsed as { items: SnapshotItem[] }).items;
  } catch {
    return null;
  }
}
