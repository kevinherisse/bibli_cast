import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { lookupIsbn } from "@/lib/bookLookup";

// lookupIsbn calls out to several external book/cover APIs. Even running
// them in parallel, a slow one can take several seconds — give this route
// headroom beyond Vercel's default (10s on Hobby without Fluid Compute)
// rather than risk the function getting killed mid-lookup.
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "scanner" && user.role !== "admin")) {
    return NextResponse.json({ error: "not authorized" }, { status: 403 });
  }

  const isbn = request.nextUrl.searchParams.get("isbn");
  if (!isbn) {
    return NextResponse.json({ error: "missing isbn" }, { status: 400 });
  }

  const book = await lookupIsbn(isbn);
  if (!book) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  return NextResponse.json(book);
}
