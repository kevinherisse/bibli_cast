"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Book, Claim } from "@/lib/types";

const CACHE_KEY = "bibli-cast:books-cache:v1";

type Cache = { books: Book[]; claims: Claim[] };

// Loads books + claims via the browser Supabase client (protected by RLS).
// Renders instantly from a localStorage cache on repeat visits, then
// revalidates in the background — a simple stale-while-revalidate.
export function useBookData() {
  const [books, setBooks] = useState<Book[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const [booksRes, claimsRes] = await Promise.all([
      supabase.from("books").select("*").order("title", { ascending: true }),
      supabase.from("claims").select("*"),
    ]);

    if (booksRes.error || claimsRes.error) {
      setError(booksRes.error?.message ?? claimsRes.error?.message ?? "Failed to load books");
      return;
    }

    const nextBooks = booksRes.data ?? [];
    const nextClaims = claimsRes.data ?? [];
    setBooks(nextBooks);
    setClaims(nextClaims);
    setError(null);

    try {
      const cache: Cache = { books: nextBooks, claims: nextClaims };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
      // localStorage unavailable (private mode, quota) — safe to ignore.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as Cache;
        // Seeding state from localStorage (an external system) on mount, before
        // the network refresh below resolves — this is the cache-hit fast path.
        /* eslint-disable react-hooks/set-state-in-effect */
        setBooks(parsed.books);
        setClaims(parsed.claims);
        setLoading(false);
        /* eslint-enable react-hooks/set-state-in-effect */
      }
    } catch {
      // Ignore malformed/unavailable cache.
    }

    refresh().finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [refresh]);

  return { books, claims, loading, error, refresh, setBooks, setClaims };
}
