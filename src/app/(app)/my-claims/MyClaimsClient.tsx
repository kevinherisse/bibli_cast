"use client";

import { useMemo } from "react";
import BookCard from "@/components/BookCard";
import { createClient } from "@/lib/supabase/client";
import { useBookData } from "@/lib/useBookData";
import { humanizeClaimError } from "@/lib/errors";
import type { Claim } from "@/lib/types";

export default function MyClaimsClient({ myEmail }: { myEmail: string }) {
  const { books, claims, loading, setClaims } = useBookData();

  const myClaims = useMemo(
    () => claims.filter((c) => c.user_email === myEmail),
    [claims, myEmail],
  );

  const claimsByBook = useMemo(() => {
    const map = new Map<string, Claim[]>();
    for (const claim of claims) {
      const list = map.get(claim.book_id) ?? [];
      list.push(claim);
      map.set(claim.book_id, list);
    }
    return map;
  }, [claims]);

  const myBooks = useMemo(
    () => myClaims.map((c) => books.find((b) => b.id === c.book_id)).filter((b) => !!b),
    [myClaims, books],
  );

  async function handleUnclaim(bookId: string) {
    const claim = myClaims.find((c) => c.book_id === bookId);
    if (!claim) return { ok: false, error: "Vous n'avez pas réservé ce livre." };
    const supabase = createClient();
    const { error } = await supabase.from("claims").delete().eq("id", claim.id);
    if (error) return { ok: false, error: humanizeClaimError(error.message) };
    setClaims((prev) => prev.filter((c) => c.id !== claim.id));
    return { ok: true };
  }

  async function noopClaim() {
    return { ok: false, error: "Déjà réservé." };
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Mes réservations</h1>
        <p className="text-sm text-gray-600">
          Vous avez réservé {myClaims.length} {myClaims.length === 1 ? "livre" : "livres"}.
        </p>
      </div>

      {loading && books.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-500">Chargement…</p>
      ) : myBooks.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-500">
          Vous n&apos;avez pas encore réservé de livre. Rendez-vous dans la galerie pour parcourir
          la collection.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {myBooks.map((book) => {
            const claim = myClaims.find((c) => c.book_id === book!.id)!;
            return (
              <BookCard
                key={book!.id}
                book={book!}
                copiesClaimed={(claimsByBook.get(book!.id) ?? []).length}
                claimedByMe
                onClaim={noopClaim}
                onUnclaim={handleUnclaim}
                footer={
                  claim.note && (
                    <p className="mt-2 rounded-lg bg-gray-50 p-2 text-xs text-gray-600">
                      &ldquo;{claim.note}&rdquo;
                    </p>
                  )
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
