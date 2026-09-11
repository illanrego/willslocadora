-- Owner-managed catalogue exclusions. Rows are retained when a block is restored
-- so the owner has an audit trail without exposing it to public catalogue reads.
begin;

create table public.catalogue_blocks (
  id uuid primary key default gen_random_uuid(),
  title_type text not null check (title_type in ('movie', 'series')),
  tmdb_id bigint not null check (tmdb_id > 0),
  canonical_key text generated always as (title_type || ':' || tmdb_id::text) stored,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  created_by text not null references public."user"(id) on delete restrict,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by text references public."user"(id) on delete restrict,
  constraint catalogue_blocks_restore_pair check ((removed_at is null) = (removed_by is null))
);

create unique index catalogue_blocks_one_active_title
  on public.catalogue_blocks (title_type, tmdb_id)
  where removed_at is null;
create index catalogue_blocks_history_newest
  on public.catalogue_blocks (created_at desc);
create index catalogue_blocks_active_key
  on public.catalogue_blocks (canonical_key)
  where removed_at is null;

alter table public.catalogue_blocks enable row level security;
revoke all on public.catalogue_blocks from anon, authenticated;

commit;

