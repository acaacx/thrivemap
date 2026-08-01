"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setUserRole } from "../actions";

const MANAGEABLE_ROLES = [
  "user",
  "clinic_representative",
  "moderator",
  "administrator",
] as const;

type ManageableRole = (typeof MANAGEABLE_ROLES)[number];

interface UserRolesEditorProps {
  userId: string;
  roles: string[];
  isSelf: boolean;
}

/** Grant/revoke role chips with a required reason — administrator only. */
export function UserRolesEditor({
  userId,
  roles,
  isSelf,
}: UserRolesEditorProps) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busyRole, setBusyRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onToggle(role: ManageableRole) {
    setError(null);
    if (!reason.trim()) {
      setError("Enter a reason first.");
      return;
    }
    setBusyRole(role);
    try {
      const grant = !roles.includes(role);
      const result = await setUserRole(userId, role, grant, reason.trim());
      if (result.error) setError(result.error);
      else {
        setReason("");
        router.refresh();
      }
    } finally {
      setBusyRole(null);
    }
  }

  if (isSelf) {
    return (
      <p className="text-xs text-muted-foreground">
        You cannot change your own roles.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {MANAGEABLE_ROLES.map((role) => {
          const held = roles.includes(role);
          return (
            <Button
              key={role}
              size="sm"
              variant={held ? "default" : "outline"}
              className="rounded-full text-xs"
              disabled={busyRole !== null}
              onClick={() => onToggle(role)}
              aria-pressed={held}
            >
              {busyRole === role && (
                <Loader2 aria-hidden className="mr-1.5 h-3 w-3 animate-spin" />
              )}
              {role.replaceAll("_", " ")}
            </Button>
          );
        })}
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required)"
          className="h-8 w-48 text-xs"
          aria-label="Reason for role change"
        />
      </div>
    </div>
  );
}
