import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

export type AppRole = Database["public"]["Enums"]["app_role"];

/** Current authenticated user, or null. Cached per request. */
export const getCurrentUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** Roles of the current user (empty when signed out). Cached per request. */
export const getCurrentUserRoles = cache(async (): Promise<AppRole[]> => {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  return (data ?? []).map((r) => r.role);
});

/** Requires a signed-in user; redirects to /login otherwise. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Requires one of the given roles. Every privileged server action must call
 * this — RLS is the backstop, this is the front door.
 */
export async function requireRole(...roles: AppRole[]) {
  const user = await requireUser();
  const held = await getCurrentUserRoles();
  if (!roles.some((role) => held.includes(role))) redirect("/");
  return { user, roles: held };
}

export async function hasRole(role: AppRole): Promise<boolean> {
  return (await getCurrentUserRoles()).includes(role);
}
