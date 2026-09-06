import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

export type CurrentUser = {
  email: string;
  role: Role;
};

// Server-side helper: resolves the logged-in user's email + allowlist role.
// Returns null if there's no session, or if the session's email has since
// been removed from the allowlist.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const { data: role } = await supabase.rpc("my_role");

  if (!role) return null;

  return { email: user.email, role: role as Role };
}

// Call at the top of a Server Component page to require login. Redirects to
// /login if there's no session, or a page explaining the account was removed
// from the allowlist if the session email is no longer allowed.
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?reason=not-allowed");
  return user;
}

// Call at the top of a Server Component page to require one of the given
// roles. Redirects non-matching, logged-in users back to /gallery.
export async function requireRole(roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/gallery");
  return user;
}
