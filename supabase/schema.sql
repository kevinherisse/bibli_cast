-- Memorial Book Collection App — Supabase schema
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE throughout.

-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists pgcrypto;

-- ============================================================
-- Tables
-- ============================================================
create table if not exists allowed_users (
  email      text primary key,
  role       text not null check (role in ('viewer', 'scanner', 'admin')),
  invited_at timestamptz not null default now()
);

create table if not exists books (
  id             uuid primary key default gen_random_uuid(),
  isbn           text,
  title          text not null,
  author         text,
  cover_url      text,
  thumbnail_url  text,
  category       text,
  total_copies   int not null default 1 check (total_copies >= 1),
  created_at     timestamptz not null default now()
);

create table if not exists claims (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references books(id) on delete cascade,
  user_email  text not null,
  note        text,
  claimed_at  timestamptz not null default now()
);

-- A given person can only hold one claim per book (one copy per person).
create unique index if not exists claims_book_user_unique on claims(book_id, user_email);
create index if not exists books_isbn_idx on books(isbn);
create index if not exists claims_book_id_idx on claims(book_id);
create index if not exists claims_user_email_idx on claims(user_email);

-- ============================================================
-- Base table/schema privileges.
--
-- RLS policies (below) restrict which ROWS a role can see/touch, but
-- Postgres also requires a base GRANT before it even evaluates RLS. Most
-- Supabase projects have `anon`/`authenticated`/`service_role` pre-granted
-- access to everything in `public` by default — but that's a project-level
-- default, not something this script can assume, so we grant explicitly.
-- ============================================================
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- ============================================================
-- Helper functions (SECURITY DEFINER so they can read allowed_users
-- regardless of the caller's own row-level-security visibility)
-- ============================================================

-- Returns the role of the currently-authenticated user, or null.
create or replace function my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from allowed_users where email = auth.jwt() ->> 'email';
$$;

grant execute on function my_role() to authenticated;

-- Returns true if the currently-authenticated user is on the allowlist.
create or replace function is_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from allowed_users where email = auth.jwt() ->> 'email');
$$;

grant execute on function is_allowed() to authenticated;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table allowed_users enable row level security;
alter table books enable row level security;
alter table claims enable row level security;

-- allowed_users: only admins can read/write the allowlist through the API.
-- (The pre-signup allowlist check on /login is done server-side with the
-- service role key, which bypasses RLS entirely — see src/lib/supabase/admin.ts.)
drop policy if exists allowed_users_admin_all on allowed_users;
create policy allowed_users_admin_all on allowed_users
  for all
  using (my_role() = 'admin')
  with check (my_role() = 'admin');

-- books: any allowlisted user can read; only admins can write directly.
-- (The scanner flow writes through the upsert_scanned_book() function below,
-- which is SECURITY DEFINER and checks the caller's role itself.)
drop policy if exists books_select on books;
create policy books_select on books
  for select
  using (is_allowed());

drop policy if exists books_admin_write on books;
create policy books_admin_write on books
  for all
  using (my_role() = 'admin')
  with check (my_role() = 'admin');

-- claims: any allowlisted user can see all claims (needed to compute
-- availability and to show who has claimed what). Inserts happen only
-- through the claim_book() function below. Users may delete their own
-- claim; admins may delete anyone's.
drop policy if exists claims_select on claims;
create policy claims_select on claims
  for select
  using (is_allowed());

drop policy if exists claims_delete on claims;
create policy claims_delete on claims
  for delete
  using (
    is_allowed()
    and (user_email = auth.jwt() ->> 'email' or my_role() = 'admin')
  );

-- ============================================================
-- claim_book: atomic claim, safe under concurrent requests for the
-- last remaining copy. Locks the book row for the duration of the
-- transaction so two simultaneous claims can't both succeed.
-- ============================================================
create or replace function claim_book(p_book_id uuid, p_note text default null)
returns claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := auth.jwt() ->> 'email';
  v_total  int;
  v_count  int;
  v_claim  claims;
begin
  if v_email is null or not exists (select 1 from allowed_users where email = v_email) then
    raise exception 'not authorized';
  end if;

  select total_copies into v_total
  from books
  where id = p_book_id
  for update; -- lock the row so concurrent claims serialize

  if v_total is null then
    raise exception 'book not found';
  end if;

  select count(*) into v_count from claims where book_id = p_book_id;

  if v_count >= v_total then
    raise exception 'no copies available';
  end if;

  insert into claims (book_id, user_email, note)
  values (p_book_id, v_email, nullif(trim(p_note), ''))
  returning * into v_claim;

  return v_claim;
end;
$$;

grant execute on function claim_book(uuid, text) to authenticated;

-- ============================================================
-- upsert_scanned_book: used by /scan. If a book with this ISBN already
-- exists, increments total_copies instead of creating a duplicate row.
-- SECURITY DEFINER so it can insert/update books directly; checks the
-- caller has the scanner or admin role itself.
-- ============================================================
create or replace function upsert_scanned_book(
  p_isbn          text,
  p_title         text,
  p_author        text,
  p_cover_url     text,
  p_thumbnail_url text,
  p_category      text
)
returns books
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role  text := my_role();
  v_book  books;
begin
  if v_role is null or v_role not in ('scanner', 'admin') then
    raise exception 'not authorized';
  end if;

  if p_isbn is not null and length(trim(p_isbn)) > 0 then
    select * into v_book from books where isbn = p_isbn for update;
  end if;

  if v_book.id is not null then
    update books
    set total_copies = total_copies + 1
    where id = v_book.id
    returning * into v_book;
  else
    insert into books (isbn, title, author, cover_url, thumbnail_url, category, total_copies)
    values (nullif(p_isbn, ''), p_title, p_author, p_cover_url, p_thumbnail_url, p_category, 1)
    returning * into v_book;
  end if;

  return v_book;
end;
$$;

grant execute on function upsert_scanned_book(text, text, text, text, text, text) to authenticated;

-- ============================================================
-- Seed the first admin (edit the email, then run this once).
-- Do this BEFORE anyone tries to log in.
-- ============================================================
-- insert into allowed_users (email, role) values ('you@example.com', 'admin')
--   on conflict (email) do update set role = excluded.role;
