import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { clientEnv, serverEnv } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS — use only in server code paths that have
 * already performed their own authorization checks. Never import from client
 * components (enforced by the "server-only" import).
 */
export function createSupabaseAdminClient() {
  return createClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
