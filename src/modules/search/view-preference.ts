/**
 * Mobile List | Map preference. The URL (`?view=`) wins so a shared link
 * opens the way it was sent; otherwise the last choice on this device.
 */
export const VIEW_STORAGE_KEY = "tm-view";

export type ShellView = "list" | "map";

export function isShellView(value: unknown): value is ShellView {
  return value === "list" || value === "map";
}

export function resolveInitialView(
  urlView: string | null | undefined,
  storedView: string | null | undefined,
  fallback: ShellView = "list",
): ShellView {
  if (isShellView(urlView)) return urlView;
  if (isShellView(storedView)) return storedView;
  return fallback;
}

export function readStoredView(): ShellView | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return isShellView(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeStoredView(view: ShellView) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    // Private mode / quota — the URL still carries the choice.
  }
}

/** Adds or removes `view=` on a query string without touching other keys. */
export function withViewParam(
  queryString: string,
  view: ShellView | null,
): string {
  const qs = new URLSearchParams(queryString);
  if (view) qs.set("view", view);
  else qs.delete("view");
  return qs.toString();
}
