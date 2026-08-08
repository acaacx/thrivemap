"use client";

import { useEffect, useState } from "react";
import { readSnapshot, type SnapshotItem } from "@/modules/favorites/snapshot";

export function OfflineFavorites() {
  const [items, setItems] = useState<SnapshotItem[] | null>(null);

  useEffect(() => {
    queueMicrotask(() => setItems(readSnapshot()));
  }, []);

  if (!items || items.length === 0) {
    return (
      <p className="text-foreground/85">No saved clinics on this device yet.</p>
    );
  }

  return (
    <ul className="space-y-4">
      {items.map((item) => (
        <li key={item.slug} className="border-b border-border pb-4 last:border-0 last:pb-0">
          <p className="font-medium">{item.name}</p>
          <p className="text-foreground/85">{item.address}</p>
          {item.phone && (
            <p>
              <a href={`tel:${item.phone}`} className="text-primary underline">
                {item.phone}
              </a>
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
