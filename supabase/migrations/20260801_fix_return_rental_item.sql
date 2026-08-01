-- Repair return_rental_item after PostgreSQL treated output-column names
-- (id, returned_at, watched_status) as ambiguous PL/pgSQL variables.
create or replace function public.return_rental_item(p_user_id text, p_rental_item_id uuid, p_watched_status text)
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

  update public.rental_items as target
  set returned_at = now(), watched_status = p_watched_status
  where target.id = p_rental_item_id
    and target.user_id = p_user_id
    and target.returned_at is null
  returning target.* into item;

  if not found then
    raise exception 'active_rental_item_not_found' using errcode = 'P0001';
  end if;

  if p_watched_status = 'watched' then
    update public.watchlist_items as watchlist
    set completed_at = now()
    where watchlist.user_id = p_user_id
      and watchlist.canonical_key = item.canonical_key
      and watchlist.completed_at is null;
  end if;

  update public.rentals as rental
  set returned_at = now()
  where rental.id = item.rental_id
    and not exists (
      select 1
      from public.rental_items as remaining
      where remaining.rental_id = item.rental_id
        and remaining.returned_at is null
    );

  return query select item.id, item.returned_at, item.watched_status;
end;
$$;

revoke all on function public.return_rental_item(text, uuid, text) from public, anon, authenticated;
