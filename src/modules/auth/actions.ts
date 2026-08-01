"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { siteConfig } from "@/lib/site-config";
import { enqueueAddressEmail } from "@/modules/jobs/notify";
import { checkRateLimit } from "@/modules/shared/rate-limit";

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  next: z.string().startsWith("/").max(200).optional(),
});

const emailOnlySchema = credentialsSchema.pick({ email: true, next: true });

export interface AuthFormState {
  error?: string;
  message?: string;
}

function safeNext(next: string | undefined): string {
  // Only allow same-site relative paths.
  if (!next || !next.startsWith("/") || next.startsWith("//"))
    return "/account";
  return next;
}

export async function signUp(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: "Enter a valid email and a password of at least 8 characters.",
    };
  }
  const limited = await checkRateLimit(
    "auth:signup",
    parsed.data.email,
    5,
    3600,
  );
  if (!limited.allowed) {
    return { error: "Too many attempts. Please try again later." };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${siteConfig.url}/auth/callback` },
  });
  if (error) return { error: error.message };
  await enqueueAddressEmail(
    parsed.data.email,
    "welcome",
    {},
    `welcome-${parsed.data.email.toLowerCase()}`,
  );
  return {
    message:
      "Check your email to confirm your account. In local development, open Mailpit at http://127.0.0.1:54324.",
  };
}

export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }
  const limited = await checkRateLimit(
    "auth:signin",
    parsed.data.email,
    10,
    900,
  );
  if (!limited.allowed) {
    return { error: "Too many attempts. Please try again later." };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { error: "Incorrect email or password." };
  redirect(safeNext(parsed.data.next));
}

export async function sendMagicLink(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = emailOnlySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a valid email address." };
  const limited = await checkRateLimit(
    "auth:magic",
    parsed.data.email,
    5,
    3600,
  );
  if (!limited.allowed) {
    return { error: "Too many attempts. Please try again later." };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: `${siteConfig.url}/auth/callback` },
  });
  if (error) return { error: error.message };
  return {
    message:
      "Magic link sent — check your email. In local development, open Mailpit at http://127.0.0.1:54324.",
  };
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
