"use client";

import Image from "next/image";
import { useState } from "react";
import type { Book } from "@/lib/types";

type Props = {
  book: Book;
  copiesClaimed: number;
  claimedByMe: boolean;
  onClaim: (bookId: string, note: string) => Promise<{ ok: boolean; error?: string }>;
  onUnclaim: (bookId: string) => Promise<{ ok: boolean; error?: string }>;
  /** Extra content rendered under the card, e.g. admin edit/delete controls. */
  footer?: React.ReactNode;
};

export default function BookCard({
  book,
  copiesClaimed,
  claimedByMe,
  onClaim,
  onUnclaim,
  footer,
}: Props) {
  const [showNoteField, setShowNoteField] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = Math.max(book.total_copies - copiesClaimed, 0);
  const isAvailable = available > 0 || claimedByMe;

  async function handleClaim() {
    setBusy(true);
    setError(null);
    const result = await onClaim(book.id, note);
    setBusy(false);
    if (result.ok) {
      setShowNoteField(false);
      setNote("");
    } else {
      setError(result.error ?? "Impossible de réserver ce livre — il vient peut-être d'être pris.");
    }
  }

  async function handleUnclaim() {
    setBusy(true);
    setError(null);
    const result = await onUnclaim(book.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Impossible d'annuler la réservation.");
    }
  }

  return (
    <div className="flex gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:flex-col sm:p-4">
      <div className="relative aspect-2/3 w-20 min-h-20 shrink-0 overflow-hidden rounded-lg bg-gray-100 sm:w-full sm:min-h-48">
        {book.thumbnail_url ? (
          <Image
            src={book.thumbnail_url}
            alt={book.title}
            fill
            loading="lazy"
            sizes="(min-width: 640px) 33vw, 80px"
            unoptimized
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
            Pas de couverture
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="line-clamp-2 text-sm font-semibold text-gray-900 sm:text-base">
          {book.title}
        </h3>
        {book.author && <p className="mt-0.5 truncate text-sm text-gray-600">{book.author}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {book.category && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {book.category}
            </span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              available > 0
                ? "bg-green-100 text-green-800"
                : "bg-gray-200 text-gray-600"
            }`}
          >
            {book.total_copies > 1
              ? `${available} sur ${book.total_copies} exemplaires disponibles`
              : available > 0
                ? "Disponible"
                : "Réservé"}
          </span>
          {claimedByMe && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
              Réservé par vous
            </span>
          )}
        </div>

        <div className="mt-auto pt-3">
          {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

          {claimedByMe ? (
            <button
              onClick={handleUnclaim}
              disabled={busy}
              className="w-full rounded-xl border border-red-200 bg-red-50 py-2.5 text-sm font-medium text-red-700 active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? "Annulation…" : "Se désister"}
            </button>
          ) : showNoteField ? (
            <div className="space-y-2">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Pourquoi je le/la voudrais (facultatif)"
                rows={2}
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowNoteField(false)}
                  className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-medium text-gray-700 active:scale-[0.98]"
                >
                  Annuler
                </button>
                <button
                  onClick={handleClaim}
                  disabled={busy}
                  className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white active:scale-[0.98] disabled:opacity-50"
                >
                  {busy ? "Réservation…" : "Confirmer"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowNoteField(true)}
              disabled={!isAvailable || busy}
              className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {isAvailable ? "Réserver" : "Indisponible"}
            </button>
          )}
        </div>

        {footer}
      </div>
    </div>
  );
}
