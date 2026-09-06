import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Only allow same-app, relative redirect targets. Concatenating an
// unvalidated `next` param onto `origin` is an open-redirect vector — e.g.
// `next=@evil.com` turns `http://origin` + `@evil.com` into a URL where
// `evil.com` parses as the host (the classic `user:pass@host` trick).
function safeNext(next: string | null): string {
  if (next && /^\/(?!\/)/.test(next)) return next;
  return "/gallery";
}

// Handles the magic-link redirect: exchanges the one-time code for a session.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?reason=link-expired`);
}
