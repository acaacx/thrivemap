"use client";

import { useEffect } from "react";
import { writeSnapshot, type SnapshotItem } from "./snapshot";

export function FavoritesSnapshot({ items }: { items: SnapshotItem[] }) {
  useEffect(() => {
    writeSnapshot(items);
  }, [items]);
  return null;
}
