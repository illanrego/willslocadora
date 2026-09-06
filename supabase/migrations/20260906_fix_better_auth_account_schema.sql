-- Better Auth 1.7 requires an issuer for every credential or external account.
-- This forward migration also completes the audited Clerk -> Better Auth cutover
-- and synchronizes the Locadora profile with Better Auth's canonical username.
begin;

alter table public.account add column if not exists issuer text;

update public.account
set issuer = "providerId"
where issuer is null;

alter table public.account alter column issuer set not null;

alter table public.account drop constraint if exists "account_providerId_accountId_key";
drop index if exists public.account_issuer_account_id_idx;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'account_issuer_account_id_key'
      and conrelid = 'public.account'::regclass
  ) then
    alter table public.account
      add constraint account_issuer_account_id_key unique (issuer, "accountId");
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from public."user"
    where id = 'lrxF7JP8znJUrE4naJPZoWehQYt8X5Zt' and username = 'will'
  ) then
    raise exception 'Expected Better Auth account will was not found; refusing identity cleanup';
  end if;
end;
$$;

-- Confirmed disposable production identity from the September 2026 cutover.
delete from public.verification
where identifier = (
  select email from public."user"
  where id = 'lw4jGnG5uy7n9vYXDdz1ZAqEdGTIuTcF' and username = 'willl'
);

delete from public."user"
where id = 'lw4jGnG5uy7n9vYXDdz1ZAqEdGTIuTcF'
  and username = 'willl';

-- Confirmed legacy Clerk profiles. Their dependent Locadora rows cascade with them.
delete from public.profiles
where (user_id = 'user_3HJa0UTMJEpFiQNncX0xNtw84Bm' and username = 'will')
   or (user_id = 'user_3IQL01jonSJRAdtCI2PKu9y4Ntr' and username = 'diegoasr');

-- Every remaining Better Auth user receives exactly one Locadora member profile.
insert into public.profiles (user_id, username)
select auth_user.id, auth_user.username
from public."user" as auth_user
on conflict (user_id) do update set username = excluded.username;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_better_auth_user_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_better_auth_user_fkey
      foreign key (user_id) references public."user"(id) on delete cascade
      not valid;
  end if;
end;
$$;
alter table public.profiles validate constraint profiles_better_auth_user_fkey;

create or replace function public.sync_better_auth_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.profiles (user_id, username)
  values (new.id, new.username)
  on conflict (user_id) do update set username = excluded.username;
  return new;
end;
$$;

drop trigger if exists sync_better_auth_profile on public."user";
create trigger sync_better_auth_profile
after insert or update of username on public."user"
for each row execute function public.sync_better_auth_profile();

-- Profile edits update the canonical Better Auth username; the trigger then updates
-- the Locadora projection in the same database transaction.
create or replace function public.set_member_username(p_user_id text, p_username text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.profiles;
begin
  if p_username is null or p_username !~ '^[a-z0-9_-]{3,24}$' then
    raise exception 'invalid_username' using errcode = '22023';
  end if;

  update public."user"
  set username = p_username,
      name = p_username,
      "updatedAt" = now()
  where id = p_user_id;

  if not found then
    raise exception 'auth_user_required' using errcode = 'P0001';
  end if;

  select profile.* into result
  from public.profiles as profile
  where profile.user_id = p_user_id;
  return result;
end;
$$;

revoke all on function public.set_member_username(text, text) from public, anon, authenticated;
grant execute on function public.set_member_username(text, text) to service_role;

commit;
