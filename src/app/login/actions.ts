"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SendMagicLinkResult =
  | { ok: true }
  | { ok: false; error: "not-allowed" | "invalid-email" | "send-failed" | "check-failed" };

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host");
  return `${proto}://${host}`;
}

export async function sendMagicLink(email: string): Promise<SendMagicLinkResult> {
  const normalized = email.trim().toLowerCase();

  if (!isValidEmail(normalized)) {
    return { ok: false, error: "invalid-email" };
  }

  // Check the allowlist BEFORE sending anything, using the service-role
  // client so this works with no session/JWT present yet.
  const admin = createAdminClient();
  const { data: allowed, error: lookupError } = await admin
    .from("allowed_users")
    .select("email")
    .eq("email", normalized)
    .maybeSingle();

  if (lookupError) {
    console.error("allowlist lookup failed:", lookupError.message);
    return { ok: false, error: "check-failed" };
  }

  if (!allowed) {
    return { ok: false, error: "not-allowed" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: {
      emailRedirectTo: `${await siteUrl()}/auth/callback`,
    },
  });

  if (error) {
    return { ok: false, error: "send-failed" };
  }

  return { ok: true };
}
