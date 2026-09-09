import { XMLParser } from "fast-xml-parser";

export type OpenLibraryBook = {
  isbn: string;
  title: string;
  author: string | null;
  category: string | null;
  cover_url: string | null;
  thumbnail_url: string | null;
};

type Cover = { cover_url: string | null; thumbnail_url: string | null };
type Meta = { title: string | null; author: string | null; category: string | null } & Cover;

type OLBooksResponse = Record<
  string,
  {
    title?: string;
    authors?: { name: string }[];
    subjects?: { name: string }[];
    cover?: { small?: string; medium?: string; large?: string };
  }
>;

type GoogleBooksResponse = {
  items?: {
    volumeInfo?: {
      title?: string;
      authors?: string[];
      categories?: string[];
      imageLinks?: { smallThumbnail?: string; thumbnail?: string };
    };
  }[];
};

const EMPTY_META: Meta = {
  title: null,
  author: null,
  category: null,
  cover_url: null,
  thumbnail_url: null,
};

function toHttps(url: string | undefined): string | null {
  return url ? url.replace(/^http:/, "https:") : null;
}

// Primary source: title/author/category/cover via the Open Library Books API.
// https://openlibrary.org/dev/docs/api/books
async function lookupOpenLibrary(isbn: string): Promise<Meta> {
  const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&jscmd=data&format=json`;

  let res: Response;
  try {
    // Open Library's own latency is highly variable in practice (observed
    // 2-8s round trips) — give it real room before giving up, but not so
    // much that it dominates the overall lookup budget (see lookupIsbn).
    res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  } catch (err) {
    // Open Library's API is occasionally flaky (timeouts, connection resets).
    console.error("Open Library lookup failed:", err);
    return EMPTY_META;
  }
  if (!res.ok) return EMPTY_META;

  const data = (await res.json()) as OLBooksResponse;
  const entry = data[`ISBN:${isbn}`];
  if (!entry?.title) return EMPTY_META;

  // Only trust cover URLs the API explicitly reports. Guessing a
  // /b/isbn/{isbn}-L.jpg URL when `cover` is absent doesn't work: Open
  // Library's covers endpoint returns HTTP 200 with a blank 1x1 GIF for
  // ISBNs with no cover, instead of a 404 — so a guessed URL always
  // "loads" even when there's nothing to show.
  const cover = entry.cover;

  return {
    title: entry.title,
    author: entry.authors?.map((a) => a.name).join(", ") ?? null,
    category: entry.subjects?.[0]?.name ?? null,
    cover_url: cover?.large ?? cover?.medium ?? null,
    thumbnail_url: cover?.small ?? cover?.medium ?? null,
  };
}

// Cover-only fallback via an unofficial bridge to the BnF (Bibliothèque
// nationale de France) legal-deposit cover service: https://couverture.geobib.fr/
// Every book published/distributed in France must be deposited with the BnF,
// so this tends to beat both Open Library and Google Books for French titles
// specifically. Not an official/guaranteed-uptime API — best effort only.
// A miss is reported as HTTP 500 (not 404), so any non-200 is treated as "no cover".
async function lookupBnfCover(isbn: string): Promise<Cover> {
  try {
    const res = await fetch(`https://couverture.geobib.fr/api/v1/${isbn}/medium`, {
      method: "HEAD",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { cover_url: null, thumbnail_url: null };

    return {
      cover_url: `https://couverture.geobib.fr/api/v1/${isbn}/large`,
      thumbnail_url: `https://couverture.geobib.fr/api/v1/${isbn}/small`,
    };
  } catch (err) {
    console.error("BnF cover lookup failed:", err);
    return { cover_url: null, thumbnail_url: null };
  }
}

const bnfXmlParser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });

// BnF creator strings look like "Filteau-Chiba, Gabrielle (1987-....). Auteur
// du texte" — strip the birth/death years and role suffix, and flip
// "Last, First" to "First Last" to match the other sources' author format.
function cleanBnfCreator(raw: string): string {
  const namePart = raw.split("(")[0].trim().replace(/\.$/, "");
  const [last, first] = namePart.split(",").map((s) => s.trim());
  return last && first ? `${first} ${last}` : namePart;
}

// Full-metadata fallback via the BnF's official public SRU catalog API —
// distinct from lookupBnfCover above (that's an unofficial cover-only
// bridge; this queries BnF directly). Every book published/distributed in
// France must legally be deposited there, so this often finds French titles
// Open Library has no record of at all. https://catalogue.bnf.fr/api/SRU
async function lookupBnfMetadata(isbn: string): Promise<{ title: string | null; author: string | null }> {
  const empty = { title: null, author: null };
  try {
    const query = encodeURIComponent(`bib.isbn all "${isbn}"`);
    const url = `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=${query}&recordSchema=dublincore&maximumRecords=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return empty;

    const xml = bnfXmlParser.parse(await res.text());
    const dc = xml?.searchRetrieveResponse?.records?.record?.recordData?.dc;
    if (!dc) return empty;

    // dc:title is "Title / Author statement" per library cataloging convention.
    const rawTitle = Array.isArray(dc.title) ? dc.title[0] : dc.title;
    const title = typeof rawTitle === "string" ? (rawTitle.split(" / ")[0].trim() || null) : null;

    const creators: string[] = dc.creator == null ? [] : ([] as string[]).concat(dc.creator);
    const author = creators.length > 0 ? creators.map(cleanBnfCreator).join(", ") : null;

    return { title, author };
  } catch (err) {
    console.error("BnF metadata lookup failed:", err);
    return empty;
  }
}

// Full fallback via Google Books — used both when Open Library has nothing
// at all, and to fill in whatever's still missing (cover/category) otherwise.
// No API key: the anonymous tier is rate-limited per IP/day, so this is best
// effort. Biased to the French storefront since most scans are French titles.
async function lookupGoogleBooks(isbn: string): Promise<Meta> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&country=FR`,
      { signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return EMPTY_META;

    const data = (await res.json()) as GoogleBooksResponse;
    const info = data.items?.[0]?.volumeInfo;
    if (!info) return EMPTY_META;

    const links = info.imageLinks;
    const thumbnail_url = toHttps(links?.smallThumbnail) ?? toHttps(links?.thumbnail);
    const cover_url = toHttps(links?.thumbnail) ?? thumbnail_url;

    return {
      title: info.title ?? null,
      author: info.authors?.join(", ") ?? null,
      category: info.categories?.[0] ?? null,
      cover_url,
      thumbnail_url,
    };
  } catch (err) {
    console.error("Google Books lookup failed:", err);
    return EMPTY_META;
  }
}

// Looks up a book by ISBN across Open Library, BnF (cover + metadata), and
// Google Books, then merges whatever each source found by priority.
//
// The first three run IN PARALLEL, not sequentially — chaining four external
// APIs one after another has a worst case of ~30-40s (each has its own
// timeout), which is both a terrible wait for whoever's scanning and a real
// risk of tripping a serverless function's execution time limit. Running
// them concurrently caps the worst case at whichever of the three is
// slowest, rather than the sum of all three.
//
// Google Books is called separately, only if still needed, because its
// anonymous tier has a tight per-IP daily quota — no sense spending it on
// scans the first three sources already answered.
export async function lookupIsbn(rawIsbn: string): Promise<OpenLibraryBook | null> {
  const isbn = rawIsbn.replace(/[^0-9Xx]/g, "");
  if (!isbn) return null;

  const [ol, bnfCover, bnfMeta] = await Promise.all([
    lookupOpenLibrary(isbn),
    lookupBnfCover(isbn),
    lookupBnfMetadata(isbn),
  ]);

  let title = ol.title ?? bnfMeta.title;
  let author = ol.author ?? bnfMeta.author;
  let category = ol.category;
  let cover_url = ol.cover_url ?? bnfCover.cover_url;
  let thumbnail_url = ol.thumbnail_url ?? bnfCover.thumbnail_url;

  if (!title || !category || (!cover_url && !thumbnail_url)) {
    const google = await lookupGoogleBooks(isbn);
    title = title ?? google.title;
    author = author ?? google.author;
    category = category ?? google.category;
    cover_url = cover_url ?? google.cover_url;
    thumbnail_url = thumbnail_url ?? google.thumbnail_url;
  }

  if (!title) return null;

  return { isbn, title, author, category, cover_url, thumbnail_url };
}
