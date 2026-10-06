-- Account preference shared by desktop and web. Existing accounts retain three.
-- Lock the profile during renting so concurrent rents and limit updates serialize.
begin;
alter table public.profiles add column rental_limit integer not null default 3
  constraint profiles_rental_limit_range check (rental_limit between 1 and 10);

create or replace function public.rent_titles(p_user_id text, p_titles jsonb)
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
  member_rental_limit integer;
begin
  if jsonb_typeof(p_titles) <> 'array' or jsonb_array_length(p_titles) < 1 or jsonb_array_length(p_titles) > 10 then
    raise exception 'invalid_rental_batch' using errcode = 'P0001';
  end if;

  select user_id, rental_limit into locked_user_id, member_rental_limit from public.profiles where user_id = p_user_id for update;
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
  if current_count + requested_count > member_rental_limit then
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

commit;
