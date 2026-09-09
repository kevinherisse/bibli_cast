"use client";

import { useMemo, useState } from "react";
import BookCard from "@/components/BookCard";
import { createClient } from "@/lib/supabase/client";
import { useBookData } from "@/lib/useBookData";
import { humanizeClaimError } from "@/lib/errors";
import type { Claim } from "@/lib/types";

type SearchField = "all" | "title" | "author";

const SEARCH_FIELD_LABELS: Record<SearchField, string> = {
  all: "Tout",
  title: "Titre",
  author: "Auteur",
};

export default function GalleryClient({ myEmail }: { myEmail: string }) {
  const { books, claims, loading, error, setClaims } = useBookData();
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState<SearchField>("all");
  const [category, setCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const book of books) if (book.category) set.add(book.category);
    return Array.from(set).sort();
  }, [books]);

  const claimsByBook = useMemo(() => {
    const map = new Map<string, Claim[]>();
    for (const claim of claims) {
      const list = map.get(claim.book_id) ?? [];
      list.push(claim);
      map.set(claim.book_id, list);
    }
    return map;
  }, [claims]);

  const filteredBooks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return books.filter((book) => {
      if (category && book.category !== category) return false;
      if (!q) return true;
      const title = book.title.toLowerCase();
      const author = (book.author ?? "").toLowerCase();
      if (searchField === "title") return title.includes(q);
      if (searchField === "author") return author.includes(q);
      return title.includes(q) || author.includes(q);
    });
  }, [books, search, searchField, category]);

  async function handleClaim(bookId: string, note: string) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("claim_book", {
      p_book_id: bookId,
      p_note: note || null,
    });
    if (error) return { ok: false, error: humanizeClaimError(error.message) };
    setClaims((prev) => [...prev, data as Claim]);
    return { ok: true };
  }

  async function handleUnclaim(bookId: string) {
    const claim = claims.find((c) => c.book_id === bookId && c.user_email === myEmail);
    if (!claim) return { ok: false, error: "Vous n'avez pas réservé ce livre." };
    const supabase = createClient();
    const { error } = await supabase.from("claims").delete().eq("id", claim.id);
    if (error) return { ok: false, error: humanizeClaimError(error.message) };
    setClaims((prev) => prev.filter((c) => c.id !== claim.id));
    return { ok: true };
  }

  const hasActiveFilter = search.trim().length > 0 || category !== null;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm text-gray-600">
          {hasActiveFilter
            ? `${filteredBooks.length} sur ${books.length} livre${books.length === 1 ? "" : "s"}`
            : `${books.length} livre${books.length === 1 ? "" : "s"} dans la collection`}
        </p>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par titre ou auteur…"
          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />

        <div className="flex gap-1.5">
          {(["all", "title", "author"] as const).map((field) => (
            <button
              key={field}
              onClick={() => setSearchField(field)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                searchField === field
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 border border-gray-200"
              }`}
            >
              {SEARCH_FIELD_LABELS[field]}
            </button>
          ))}
        </div>

        {categories.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setCategory(null)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                category === null ? "bg-blue-600 text-white" : "bg-white text-gray-600 border border-gray-200"
              }`}
            >
              Toutes
            </button>
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                  category === c ? "bg-blue-600 text-white" : "bg-white text-gray-600 border border-gray-200"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900">
          Impossible de charger les dernières données ({error}). Affichage des données disponibles.
        </p>
      )}

      {loading && books.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-500">Chargement des livres…</p>
      ) : filteredBooks.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-500">Aucun livre ne correspond à votre recherche.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredBooks.map((book) => {
            const bookClaims = claimsByBook.get(book.id) ?? [];
            return (
              <BookCard
                key={book.id}
                book={book}
                copiesClaimed={bookClaims.length}
                claimedByMe={bookClaims.some((c) => c.user_email === myEmail)}
                onClaim={handleClaim}
                onUnclaim={handleUnclaim}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
