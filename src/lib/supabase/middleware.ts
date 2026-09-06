import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth/callback"];

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/api/auth")) return true;
  if (pathname === "/manifest.json" || pathname === "/favicon.ico") return true;
  if (pathname.startsWith("/icons/")) return true;
  return false;
}

// Refreshes the Supabase auth session on every request and redirects
// unauthenticated users away from protected pages. Role-specific gating
// (scanner/admin only routes) happens in each page via src/lib/auth.ts.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Note: we deliberately don't redirect an already-authenticated user away
  // from /login here — a Supabase session can outlive an allowlist removal,
  // and bouncing purely on session presence (without checking the allowlist)
  // would loop against the layout's own allowlist-aware redirect back to
  // /login. The login page itself redirects logged-in, still-allowed users.

  return supabaseResponse;
}
