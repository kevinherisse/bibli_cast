# His Library — Memorial Book Collection

A small, private web app for cataloging a book collection and letting an allowlisted group of
family and friends browse it and claim books to keep as a remembrance.

- **Next.js** (App Router, TypeScript) — pages, API routes, server actions
- **Supabase** — Postgres, magic-link auth, row-level security
- **Tailwind CSS** — mobile-first UI
- **html5-qrcode** — barcode scanning from the phone camera
- **Open Library API** — ISBN → title/author/cover lookup

No page is public. Every route requires a session, and every session's email must be present in
the `allowed_users` table.

## How access control works

1. `/login` takes an email, checks it against `allowed_users` **before** sending anything (using
   the Supabase service-role key, server-side only), and only then sends a Supabase magic link.
2. Once signed in, every protected page/route re-checks the session's role server-side:
   - `src/proxy.ts` (Next's middleware-equivalent, "Proxy") refreshes the auth session on every
     request and bounces anyone without a session to `/login`.
   - `src/lib/auth.ts` (`requireUser` / `requireRole`) is called at the top of each protected
     Server Component/layout and looks up the caller's role via the `my_role()` Postgres function.
3. On top of that, **Postgres Row Level Security is the real security boundary** — every table
   query, whether it comes from a Server Component or straight from the browser via
   `supabase-js`, is filtered by the policies in `supabase/schema.sql`. Even if a UI check were
   ever bypassed, the database itself won't return or accept data a role isn't allowed to touch.

## Project structure

```
src/
  app/
    login/                  Public: email + magic-link form
    auth/callback/          Magic-link redirect target (exchanges code for a session)
    auth/signout/           POST route that signs the user out
    (app)/                  Route group — every page here requires a session
      layout.tsx            Calls requireUser(), renders the NavBar
      gallery/              Browse/search/filter/claim books
      my-claims/            The current user's claimed books
      scan/                 Barcode scanner + Open Library lookup (scanner, admin)
      admin/users/          Manage the allowlist (admin)
      admin/books/          Edit/delete books, unclaim on anyone's behalf (admin)
    api/lookup-isbn/        Server-side Open Library proxy used by /scan
  components/               BookCard, NavBar
  lib/
    supabase/               Browser / server / middleware / admin (service-role) clients
    auth.ts                 getCurrentUser / requireUser / requireRole
    openlibrary.ts           ISBN lookup
    useBookData.ts           Client hook: fetch + localStorage cache of books/claims
    types.ts, errors.ts
  proxy.ts                  Session-refresh + redirect-to-login gate (Next 16's Proxy convention)
supabase/schema.sql          Full schema, RLS policies, and the atomic claim/scan functions
public/manifest.json         PWA manifest ("Add to Home Screen")
```

Almost all data operations (claim, unclaim, edit a book, manage users) go **directly from the
browser to Supabase** via `supabase-js`, relying on RLS for security — there's no CRUD API layer
to keep in sync. The two exceptions are the pre-signup allowlist check (needs the service-role key,
so it must run server-side) and the Open Library lookup (kept server-side to avoid CORS/rate-limit
surprises).

## 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** → New query, paste the contents of [`supabase/schema.sql`](supabase/schema.sql),
   and run it. This creates the tables, RLS policies, and the `claim_book` /
   `upsert_scanned_book` functions.
3. Seed yourself as the first admin — run this once, with your real email:
   ```sql
   insert into allowed_users (email, role) values ('you@example.com', 'admin');
   ```
4. In **Authentication → URL Configuration**, add your site URL (e.g. `http://localhost:3000` for
   local dev, and your Vercel URL later) to the Redirect URLs allowlist so the magic-link callback
   (`/auth/callback`) is permitted.
5. In **Authentication → Providers → Email**, magic links (OTP) are on by default — no extra setup
   needed. Optionally customize the email template under **Authentication → Email Templates**.
6. Grab your keys from **Project Settings → API**: the Project URL, the `anon` public key, and the
   `service_role` secret key.

## 2. Configure environment variables

Copy the example file and fill in the values from step 1:

```bash
cp .env.local.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # secret — never expose to the client
NEXT_PUBLIC_SITE_URL=http://localhost:3000        # your deployed URL in production
```

`SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security. It's only ever used in
`src/lib/supabase/admin.ts`, on the server, for the pre-signup allowlist check — never import that
file from a client component.

## 3. Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll be redirected to `/login`. Sign in with
the email you seeded as admin in step 1.3 — check that inbox for the magic link.

To test `/scan`, use a phone on the same network (`http://<your-machine-ip>:3000`, shown in the
`next dev` output) so you can grant camera access — most mobile browsers require HTTPS or
`localhost` for camera access, so scanning on desktop `localhost` works, but scanning from another
device on your LAN over plain HTTP will not; deploy to Vercel (HTTPS) to test scanning on a phone
that isn't the dev machine itself.

## 4. Deploy to Vercel

1. Push this repo to GitHub/GitLab/Bitbucket.
2. Import it in [Vercel](https://vercel.com/new).
3. Add the same four environment variables from step 2 in the Vercel project settings
   (Settings → Environment Variables), using your production `NEXT_PUBLIC_SITE_URL`.
4. Deploy. Then add the deployed URL to Supabase's **Authentication → URL Configuration → Redirect
   URLs** (step 1.4) — magic links won't complete without it.

## Managing the collection day-to-day

- **Add books**: sign in as a `scanner` or `admin` and use `/scan`. Scanning an ISBN already in
  the collection increments `total_copies` instead of creating a duplicate.
- **Invite people**: `/admin/users`, as an admin. They won't be able to request a magic link until
  their email is added here.
- **Fix a mistake**: `/admin/books` lets an admin edit or delete a book, and unclaim a book on
  behalf of anyone (e.g. if someone claimed the wrong one).
- **No cover after scanning**: `/scan` tries three sources in order (see below) before giving up.
  If all three miss, the book still saves — just without a cover — and you can paste any image URL
  into the "Cover image URL" field when editing that book in `/admin/books`.

## Notes on scope / decisions

- **Cover/metadata lookup** (`src/lib/openlibrary.ts`) tries three free sources in order, since no
  single one has full coverage — especially for French titles:
  1. **Open Library** — primary source for title/author/category, and cover when it has one.
  2. **BnF (Bibliothèque nationale de France)**, via an unofficial bridge at
     [couverture.geobib.fr](https://couverture.geobib.fr/) — cover-only, but strong specifically
     for French books, since every book published/distributed in France is legally required to be
     deposited there. This is a community-run, unofficial service (not something we control), so
     treat it as best-effort — it could change or go down without notice.
  3. **Google Books** — full fallback (title/author/category/cover) for anything the first two
     miss entirely. No API key is used, so it runs on Google's anonymous per-IP daily quota; if
     that's exhausted (or Google starts requiring a key for anonymous access), this step just
     fails silently and the book falls back to whatever the earlier steps found, or to manual entry.
  Cover images are stored as direct URLs from whichever source matched (`cover_url` /
  `thumbnail_url`), not uploaded to Supabase Storage — each source already serves
  appropriately-sized images, so there's nothing to gain from re-hosting them. Cover `<Image>`s are
  rendered `unoptimized` so URLs from any of these hosts (or a manually pasted one) work without
  maintaining a `next.config.ts` allowlist.
- The claim/unclaim UI enforces one claim per person per book; the database also enforces this
  with a unique index (`claims_book_user_unique`), and the last-copy race condition is closed by
  `claim_book()` locking the book row (`SELECT ... FOR UPDATE`) before checking availability.
