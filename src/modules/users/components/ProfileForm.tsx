"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfile, type ProfileFormState } from "../actions";

export function ProfileForm({
  initialDisplayName,
}: {
  initialDisplayName: string;
}) {
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(
    updateProfile,
    {},
  );

  return (
    <form action={action} className="max-w-md space-y-4">
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-sm text-[var(--verified)]">
          {state.message}
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="display_name">Display name</Label>
        <Input
          id="display_name"
          name="display_name"
          defaultValue={initialDisplayName}
          maxLength={80}
          required
        />
      </div>
      <Button type="submit" className="rounded-full" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        Save changes
      </Button>
    </form>
  );
}
