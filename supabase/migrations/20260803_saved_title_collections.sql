-- Split private saved titles into durable, independent collections.
-- Existing watchlist rows become active Assistir depois memberships.
create table public.saved_title_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(user_id) on delete cascade,
  canonical_key text not null,
  tmdb_id bigint not null check (tmdb_id > 0),
  title_type text not null check (title_type in ('movie', 'series')),
  title_snapshot text not null check (char_length(title_snapshot) between 1 and 240),
  release_year_snapshot integer check (release_year_snapshot between 1870 and 2100),
  collection text not null check (collection in ('watch_later', 'favorite')),
  source text not null check (source in ('locadora', 'letterboxd', 'startpage')),
  source_note text,
  added_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint saved_title_memberships_canonical_key_format check (canonical_key = title_type || ':' || tmdb_id::text),
  constraint saved_title_memberships_unique unique (user_id, canonical_key, collection),
  constraint saved_title_memberships_completion_only_watch_later check (completed_at is null or collection = 'watch_later')
);

insert into public.saved_title_memberships (
  id, user_id, canonical_key, tmdb_id, title_type, title_snapshot, release_year_snapshot,
  collection, source, source_note, added_at, completed_at
)
select id, user_id, canonical_key, tmdb_id, title_type, title_snapshot, release_year_snapshot,
  'watch_later', source, source_note, added_at, completed_at
from public.watchlist_items;

create index saved_title_memberships_member_collection
  on public.saved_title_memberships (user_id, collection, added_at desc);

alter table public.saved_title_memberships enable row level security;
revoke all on public.saved_title_memberships from anon, authenticated;

create function public.save_saved_title_membership(
  p_user_id text, p_collection text, p_canonical_key text, p_tmdb_id bigint,
  p_title_type text, p_title_snapshot text, p_release_year_snapshot integer,
  p_source text, p_source_note text
)
returns public.saved_title_memberships
language plpgsql security definer set search_path = public
as $$
declare result public.saved_title_memberships;
begin
  if not exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;
  if p_collection not in ('watch_later', 'favorite') then
    raise exception 'invalid_collection' using errcode = 'P0001';
  end if;
  insert into public.saved_title_memberships (
    user_id, canonical_key, tmdb_id, title_type, title_snapshot, release_year_snapshot,
    collection, source, source_note, added_at, completed_at
  ) values (
    p_user_id, p_canonical_key, p_tmdb_id, p_title_type, p_title_snapshot, p_release_year_snapshot,
    p_collection, p_source, p_source_note, now(), null
  ) on conflict (user_id, canonical_key, collection) do update set
    tmdb_id = excluded.tmdb_id, title_type = excluded.title_type,
    title_snapshot = excluded.title_snapshot, release_year_snapshot = excluded.release_year_snapshot,
    source = excluded.source, source_note = excluded.source_note, added_at = now(), completed_at = null
  returning * into result;
  return result;
end;
$$;

create function public.remove_saved_title_membership(p_user_id text, p_collection text, p_canonical_key text)
returns boolean language sql security definer set search_path = public
as $$
  delete from public.saved_title_memberships
  where user_id = p_user_id and collection = p_collection and canonical_key = p_canonical_key
  returning true;
$$;

create or replace function public.return_rental_item(p_user_id text, p_rental_item_id uuid, p_watched_status text)
returns table (id uuid, returned_at timestamptz, watched_status text)
language plpgsql security definer set search_path = public
as $$
declare item public.rental_items;
begin
  if p_watched_status not in ('watched', 'not_watched', 'unknown') then
    raise exception 'invalid_return_outcome' using errcode = 'P0001';
  end if;
  update public.rental_items as target
  set returned_at = now(), watched_status = p_watched_status
  where target.id = p_rental_item_id and target.user_id = p_user_id and target.returned_at is null
  returning target.* into item;
  if not found then raise exception 'active_rental_item_not_found' using errcode = 'P0001'; end if;
  if p_watched_status = 'watched' then
    update public.saved_title_memberships as saved
    set completed_at = now()
    where saved.user_id = p_user_id and saved.canonical_key = item.canonical_key
      and saved.collection = 'watch_later' and saved.completed_at is null;
  end if;
  update public.rentals as rental set returned_at = now()
  where rental.id = item.rental_id and not exists (
    select 1 from public.rental_items as remaining
    where remaining.rental_id = item.rental_id and remaining.returned_at is null
  );
  return query select item.id, item.returned_at, item.watched_status;
end;
$$;

revoke all on function public.save_saved_title_membership(text, text, text, bigint, text, text, integer, text, text) from public, anon, authenticated;
revoke all on function public.remove_saved_title_membership(text, text, text) from public, anon, authenticated;
revoke all on function public.return_rental_item(text, uuid, text) from public, anon, authenticated;

-- The old table is no longer authoritative after the copy above.
drop function public.save_watchlist_item(text, text, bigint, text, text, integer, text, text);
drop table public.watchlist_items;
