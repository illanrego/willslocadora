-- Active catalogue blocks apply to new personal state without rewriting history.
-- Existing saved rows remain in the database for audit/restoration, while the
-- private Worker filters them from member-facing state responses.
begin;

create or replace function public.reject_blocked_catalogue_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'update' and old.canonical_key = new.canonical_key then
    return new;
  end if;
  if exists (
    select 1 from public.catalogue_blocks
    where canonical_key = new.canonical_key and removed_at is null
  ) then
    raise exception 'catalogue_title_blocked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists saved_title_memberships_reject_blocked on public.saved_title_memberships;
create trigger saved_title_memberships_reject_blocked
before insert or update on public.saved_title_memberships
for each row execute function public.reject_blocked_catalogue_state();

drop trigger if exists rental_items_reject_blocked on public.rental_items;
create trigger rental_items_reject_blocked
before insert or update on public.rental_items
for each row execute function public.reject_blocked_catalogue_state();

revoke all on function public.reject_blocked_catalogue_state() from public, anon, authenticated;

commit;
