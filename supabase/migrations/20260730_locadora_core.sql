-- Locadora application data. Clerk owns authentication; this database stores no email or password material.
create extension if not exists pgcrypto;

create table public.profiles (
  user_id text primary key,
  username text not null unique,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_-]{3,24}$')
);

create table public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(user_id) on delete cascade,
  canonical_key text not null,
  tmdb_id bigint not null check (tmdb_id > 0),
  title_type text not null check (title_type in ('movie', 'series')),
  title_snapshot text not null check (char_length(title_snapshot) between 1 and 240),
  release_year_snapshot integer check (release_year_snapshot between 1870 and 2100),
  source text not null check (source in ('locadora', 'letterboxd', 'startpage')),
  source_note text,
  added_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint watchlist_canonical_key_format check (canonical_key = title_type || ':' || tmdb_id::text),
  constraint watchlist_unique_title_per_member unique (user_id, canonical_key)
);

create table public.rentals (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(user_id) on delete cascade,
  opened_at timestamptz not null default now(),
  returned_at timestamptz,
  constraint rentals_valid_dates check (returned_at is null or returned_at >= opened_at)
);

create unique index rentals_one_open_rental_per_member
  on public.rentals (user_id)
  where returned_at is null;

create table public.rental_items (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals(id) on delete cascade,
  user_id text not null references public.profiles(user_id) on delete cascade,
  canonical_key text not null,
  tmdb_id bigint not null check (tmdb_id > 0),
  title_type text not null check (title_type in ('movie', 'series')),
  title_snapshot text not null check (char_length(title_snapshot) between 1 and 240),
  release_year_snapshot integer check (release_year_snapshot between 1870 and 2100),
  rented_at timestamptz not null default now(),
  returned_at timestamptz,
  watched_status text check (watched_status in ('watched', 'not_watched', 'unknown')),
  constraint rental_items_canonical_key_format check (canonical_key = title_type || ':' || tmdb_id::text),
  constraint rental_items_return_state check (
    (returned_at is null and watched_status is null)
    or (returned_at is not null and watched_status is not null)
  )
);

create unique index rental_items_one_active_title_per_member
  on public.rental_items (user_id, canonical_key)
  where returned_at is null;
create index rental_items_member_history on public.rental_items (user_id, returned_at desc);
create index watchlist_items_active_by_member on public.watchlist_items (user_id, added_at desc) where completed_at is null;

alter table public.profiles enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.rentals enable row level security;
alter table public.rental_items enable row level security;
revoke all on public.profiles, public.watchlist_items, public.rentals, public.rental_items from anon, authenticated;

create function public.save_watchlist_item(
  p_user_id text,
  p_canonical_key text,
  p_tmdb_id bigint,
  p_title_type text,
  p_title_snapshot text,
  p_release_year_snapshot integer,
  p_source text,
  p_source_note text
)
returns public.watchlist_items
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.watchlist_items;
begin
  if not exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;

  insert into public.watchlist_items (
    user_id, canonical_key, tmdb_id, title_type, title_snapshot, release_year_snapshot, source, source_note, added_at, completed_at
  ) values (
    p_user_id, p_canonical_key, p_tmdb_id, p_title_type, p_title_snapshot, p_release_year_snapshot, p_source, p_source_note, now(), null
  )
  on conflict (user_id, canonical_key) do update set
    tmdb_id = excluded.tmdb_id,
    title_type = excluded.title_type,
    title_snapshot = excluded.title_snapshot,
    release_year_snapshot = excluded.release_year_snapshot,
    source = excluded.source,
    source_note = excluded.source_note,
    added_at = now(),
    completed_at = null
  returning * into result;

  return result;
end;
$$;

create function public.rent_titles(p_user_id text, p_titles jsonb)
returns table (id uuid, opened_at timestamptz, items jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  active_rental_id uuid;
  active_opened_at timestamptz;
  locked_user_id text;
  current_count integer;
  requested_count integer;
begin
  if jsonb_typeof(p_titles) <> 'array' or jsonb_array_length(p_titles) < 1 or jsonb_array_length(p_titles) > 3 then
    raise exception 'invalid_rental_batch' using errcode = 'P0001';
  end if;

  select user_id into locked_user_id from public.profiles where user_id = p_user_id for update;
  if not found then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;

  select count(*) into requested_count
  from jsonb_to_recordset(p_titles) as entry(canonical_key text, tmdb_id bigint, title_type text, title_snapshot text, release_year_snapshot integer);
  if requested_count <> jsonb_array_length(p_titles) or exists (
    select 1
    from jsonb_to_recordset(p_titles) as entry(canonical_key text, tmdb_id bigint, title_type text, title_snapshot text, release_year_snapshot integer)
    where tmdb_id is null or tmdb_id < 1
      or title_type not in ('movie', 'series')
      or canonical_key <> title_type || ':' || tmdb_id::text
      or title_snapshot is null or char_length(title_snapshot) not between 1 and 240
  ) then
    raise exception 'invalid_rental_batch' using errcode = 'P0001';
  end if;
  if (select count(distinct entry.canonical_key) from jsonb_to_recordset(p_titles) as entry(canonical_key text, tmdb_id bigint, title_type text, title_snapshot text, release_year_snapshot integer)) <> requested_count then
    raise exception 'duplicate_rental_title' using errcode = 'P0001';
  end if;

  select rentals.id, rentals.opened_at into active_rental_id, active_opened_at
  from public.rentals
  where user_id = p_user_id and returned_at is null
  for update;

  select count(*) into current_count from public.rental_items where user_id = p_user_id and returned_at is null;
  if current_count + requested_count > 3 then
    raise exception 'active_title_limit' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.rental_items active
    join jsonb_to_recordset(p_titles) as entry(canonical_key text, tmdb_id bigint, title_type text, title_snapshot text, release_year_snapshot integer)
      on entry.canonical_key = active.canonical_key
    where active.user_id = p_user_id and active.returned_at is null
  ) then
    raise exception 'title_already_rented' using errcode = 'P0001';
  end if;

  if active_rental_id is null then
    insert into public.rentals (user_id) values (p_user_id) returning rentals.id, rentals.opened_at into active_rental_id, active_opened_at;
  end if;

  insert into public.rental_items (rental_id, user_id, canonical_key, tmdb_id, title_type, title_snapshot, release_year_snapshot)
  select active_rental_id, p_user_id, entry.canonical_key, entry.tmdb_id, entry.title_type, entry.title_snapshot, entry.release_year_snapshot
  from jsonb_to_recordset(p_titles) as entry(canonical_key text, tmdb_id bigint, title_type text, title_snapshot text, release_year_snapshot integer);

  return query
    select active_rental_id, active_opened_at,
      coalesce(jsonb_agg(jsonb_build_object(
        'id', active.id,
        'canonicalKey', active.canonical_key,
        'tmdbId', active.tmdb_id,
        'type', active.title_type,
        'name', active.title_snapshot,
        'year', active.release_year_snapshot,
        'rentedAt', active.rented_at
      ) order by active.rented_at), '[]'::jsonb)
    from public.rental_items active
    where active.rental_id = active_rental_id and active.returned_at is null;
end;
$$;

create function public.return_rental_item(p_user_id text, p_rental_item_id uuid, p_watched_status text)
returns table (id uuid, returned_at timestamptz, watched_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.rental_items;
begin
  if p_watched_status not in ('watched', 'not_watched', 'unknown') then
    raise exception 'invalid_return_outcome' using errcode = 'P0001';
  end if;

  update public.rental_items
  set returned_at = now(), watched_status = p_watched_status
  where id = p_rental_item_id and user_id = p_user_id and returned_at is null
  returning * into item;
  if not found then
    raise exception 'active_rental_item_not_found' using errcode = 'P0001';
  end if;

  if p_watched_status = 'watched' then
    update public.watchlist_items
    set completed_at = now()
    where user_id = p_user_id and canonical_key = item.canonical_key and completed_at is null;
  end if;

  update public.rentals
  set returned_at = now()
  where id = item.rental_id
    and not exists (select 1 from public.rental_items where rental_id = item.rental_id and returned_at is null);

  return query select item.id, item.returned_at, item.watched_status;
end;
$$;

revoke all on function public.save_watchlist_item(text, text, bigint, text, text, integer, text, text) from public, anon, authenticated;
revoke all on function public.rent_titles(text, jsonb) from public, anon, authenticated;
revoke all on function public.return_rental_item(text, uuid, text) from public, anon, authenticated;
