"use client";

import Image from "next/image";
import { useState } from "react";
import type { Book, Claim } from "@/lib/types";

type Props = {
  book: Book;
  claims: Claim[];
  onSave: (id: string, patch: Partial<Book>) => Promise<{ ok: boolean; error?: string }>;
  onDelete: (id: string) => Promise<{ ok: boolean; error?: string }>;
  onRemoveClaim: (claimId: string) => Promise<{ ok: boolean; error?: string }>;
};

export default function AdminBookRow({ book, claims, onSave, onDelete, onRemoveClaim }: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: book.title,
    author: book.author ?? "",
    category: book.category ?? "",
    total_copies: book.total_copies,
    cover_url: book.cover_url ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setBusy(true);
    setError(null);
    const cover_url = form.cover_url.trim() || null;
    const result = await onSave(book.id, {
      title: form.title.trim(),
      author: form.author.trim() || null,
      category: form.category.trim() || null,
      total_copies: Math.max(1, Number(form.total_copies) || 1),
      cover_url,
      // No separate small-size source when a cover is pasted by hand —
      // reuse the same URL for the gallery thumbnail.
      thumbnail_url: cover_url,
    });
    setBusy(false);
    if (result.ok) setEditing(false);
    else setError(result.error ?? "Impossible d'enregistrer les modifications.");
  }

  async function handleDelete() {
    if (!confirm(`Supprimer « ${book.title} » ? Cela retire aussi toutes les réservations associées.`)) return;
    setBusy(true);
    const result = await onDelete(book.id);
    setBusy(false);
    if (!result.ok) setError(result.error ?? "Impossible de supprimer ce livre.");
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex gap-3">
        <div className="relative h-24 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100">
          {book.thumbnail_url ? (
            <Image
              src={book.thumbnail_url}
              alt={book.title}
              fill
              sizes="64px"
              unoptimized
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">
              Pas de couverture
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2">
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Titre"
                className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
              />
              <input
                value={form.author}
                onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
                placeholder="Auteur"
                className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
              />
              <div className="flex gap-2">
                <input
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="Catégorie"
                  className="flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
                />
                <input
                  type="number"
                  min={1}
                  value={form.total_copies}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, total_copies: Number(e.target.value) }))
                  }
                  className="w-20 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
                />
              </div>
              <input
                value={form.cover_url}
                onChange={(e) => setForm((f) => ({ ...f, cover_url: e.target.value }))}
                placeholder="URL de la couverture (facultatif — si la recherche n'en a pas trouvé)"
                className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
              />
            </div>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-gray-900">{book.title}</h3>
              {book.author && <p className="text-sm text-gray-600">{book.author}</p>}
              <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-gray-500">
                {book.category && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5">{book.category}</span>
                )}
                <span className="rounded-full bg-gray-100 px-2 py-0.5">
                  {claims.length} / {book.total_copies} réservé(s)
                </span>
                {book.isbn && <span className="rounded-full bg-gray-100 px-2 py-0.5">ISBN {book.isbn}</span>}
              </div>
            </>
          )}

          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

          <div className="mt-2 flex gap-2">
            {editing ? (
              <>
                <button
                  onClick={() => setEditing(false)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSave}
                  disabled={busy}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  {busy ? "Enregistrement…" : "Enregistrer"}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700"
                >
                  Modifier
                </button>
                <button
                  onClick={handleDelete}
                  disabled={busy}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Supprimer
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {claims.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3">
          {claims.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-gray-800">{c.user_email}</p>
                {c.note && <p className="truncate text-gray-500">&ldquo;{c.note}&rdquo;</p>}
              </div>
              <button
                onClick={() => onRemoveClaim(c.id)}
                className="shrink-0 rounded-lg px-2 py-1 font-medium text-red-600 hover:bg-red-100"
              >
                Annuler
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
