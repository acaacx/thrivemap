"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { sendMagicLink, signIn, signUp, type AuthFormState } from "../actions";

interface AuthFormProps {
  mode: "login" | "signup";
  next?: string;
}

const initialState: AuthFormState = {};

export function AuthForm({ mode, next }: AuthFormProps) {
  const [passwordState, passwordAction, passwordPending] = useActionState(
    mode === "login" ? signIn : signUp,
    initialState,
  );
  const [magicState, magicAction, magicPending] = useActionState(
    sendMagicLink,
    initialState,
  );
  const [showMagic, setShowMagic] = useState(false);

  const state = showMagic ? magicState : passwordState;

  return (
    <div className="space-y-6">
      {state.error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {state.error}
        </div>
      )}
      {state.message && (
        <div
          role="status"
          className="rounded-lg border border-[var(--verified)]/30 bg-[var(--verified)]/10 px-4 py-3 text-sm"
        >
          {state.message}
        </div>
      )}

      {!showMagic ? (
        <form action={passwordAction} className="space-y-4">
          {next && <input type="hidden" name="next" value={next} />}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              required
              minLength={8}
              aria-describedby={mode === "signup" ? "password-help" : undefined}
            />
            {mode === "signup" && (
              <p id="password-help" className="text-xs text-muted-foreground">
                At least 8 characters.
              </p>
            )}
          </div>
          <Button
            type="submit"
            className="w-full rounded-full"
            disabled={passwordPending}
          >
            {passwordPending && (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            )}
            {mode === "login" ? "Sign in" : "Create account"}
          </Button>
        </form>
      ) : (
        <form action={magicAction} className="space-y-4">
          {next && <input type="hidden" name="next" value={next} />}
          <div className="space-y-1.5">
            <Label htmlFor="magic-email">Email</Label>
            <Input
              id="magic-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </div>
          <Button
            type="submit"
            className="w-full rounded-full"
            disabled={magicPending}
          >
            {magicPending && (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            )}
            Email me a magic link
          </Button>
        </form>
      )}

      <Separator />

      <div className="space-y-2 text-center text-sm">
        <button
          type="button"
          className="text-primary underline-offset-4 hover:underline"
          onClick={() => setShowMagic((v) => !v)}
        >
          {showMagic
            ? "Use a password instead"
            : "Email me a magic link instead"}
        </button>
        <p className="text-muted-foreground">
          {mode === "login" ? (
            <>
              New to ThriveMap?{" "}
              <Link
                href="/signup"
                className="text-primary underline-offset-4 hover:underline"
              >
                Create an account
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-primary underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
