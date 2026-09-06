"use client";

import { useMemo, useState } from "react";
import AdminBookRow from "./AdminBookRow";
import { createClient } from "@/lib/supabase/client";
import { useBookData } from "@/lib/useBookData";
import type { Book, Claim } from "@/lib/types";

export default function AdminBooksClient() {
  const { books, claims, loading, refresh, setBooks, setClaims } = useBookData();
  const [search, setSearch] = useState("");

  const claimsByBook = useMemo(() => {
    const map = new Map<string, Claim[]>();
    for (const claim of claims) {
      const list = map.get(claim.book_id) ?? [];
      list.push(claim);
      map.set(claim.book_id, list);
    }
    return map;
  }, [claims]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return books;
    return books.filter(
      (b) => b.title.toLowerCase().includes(q) || (b.author ?? "").toLowerCase().includes(q),
    );
  }, [books, search]);

  async function handleSave(id: string, patch: Partial<Book>) {
    const supabase = createClient();
    const { error } = await supabase.from("books").update(patch).eq("id", id);
    if (error) return { ok: false, error: error.message };
    setBooks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    return { ok: true };
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("books").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    setBooks((prev) => prev.filter((b) => b.id !== id));
    setClaims((prev) => prev.filter((c) => c.book_id !== id));
    return { ok: true };
  }

  async function handleRemoveClaim(claimId: string) {
    const supabase = createClient();
    const { error } = await supabase.from("claims").delete().eq("id", claimId);
    if (error) return { ok: false, error: error.message };
    setClaims((prev) => prev.filter((c) => c.id !== claimId));
    return { ok: true };
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Gérer les livres</h1>
          <p className="text-sm text-gray-600">
            Modifiez les détails, supprimez des livres, ou annulez une réservation pour n&apos;importe qui.
          </p>
        </div>
        <button
          onClick={() => refresh()}
          className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700"
        >
          Actualiser
        </button>
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher par titre ou auteur…"
        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
      />

      {loading && books.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-500">Chargement…</p>
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-500">Aucun livre trouvé.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((book) => (
            <AdminBookRow
              key={book.id}
              book={book}
              claims={claimsByBook.get(book.id) ?? []}
              onSave={handleSave}
              onDelete={handleDelete}
              onRemoveClaim={handleRemoveClaim}
            />
          ))}
        </div>
      )}
    </div>
  );
}
