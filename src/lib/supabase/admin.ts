import { createClient } from "@supabase/supabase-js";

// Service-role client. NEVER import this from client components — it bypasses
// Row Level Security entirely. Used only for the pre-signup allowlist check
// on /login, where the visitor doesn't have a session (and thus no JWT) yet.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
