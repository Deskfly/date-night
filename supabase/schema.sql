-- Date Night: one-time database setup.
-- Paste this whole file into Supabase → SQL Editor → New query, then click Run.

create table if not exists public.items (
  couple     text        not null,
  id         text        not null,
  kind       text        not null,          -- couple | idea | date | rating
  data       jsonb       not null default '{}'::jsonb,
  deleted    boolean     not null default false,
  updated_at timestamptz not null default now(),
  primary key (couple, id)
);

create index if not exists items_couple_updated on public.items (couple, updated_at);

-- Each phone sends its couple code in an "x-couple" header.
-- These rules only let a phone see and change rows with that same code.
create or replace function public.request_couple() returns text
language sql stable as $$
  select coalesce(current_setting('request.headers', true)::json ->> 'x-couple', '')
$$;

alter table public.items enable row level security;

drop policy if exists "couple read"   on public.items;
drop policy if exists "couple insert" on public.items;
drop policy if exists "couple update" on public.items;
drop policy if exists "couple delete" on public.items;

create policy "couple read"   on public.items for select using (couple = public.request_couple());
create policy "couple insert" on public.items for insert with check (couple = public.request_couple() and length(couple) >= 8);
create policy "couple update" on public.items for update using (couple = public.request_couple()) with check (couple = public.request_couple());
create policy "couple delete" on public.items for delete using (couple = public.request_couple());

grant select, insert, update, delete on public.items to anon;
