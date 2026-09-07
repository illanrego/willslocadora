-- Reserve the Will-like ASCII username family for the owner's exact email.
-- This protects Better Auth's direct user inserts as well as application routes.
begin;

create or replace function public.is_reserved_will_username(p_username text)
returns boolean
language sql
immutable
as $$
  select regexp_replace(
    regexp_replace(lower(coalesce(p_username, '')), '[_-]', '', 'g'),
    '[il1]', 'l', 'g'
  ) = 'wlll';
$$;

alter table public."user"
  drop constraint if exists user_username_reserved_will;

alter table public."user"
  add constraint user_username_reserved_will
  check (
    lower(email) = 'emaildoillan@protonmail.com'
    or not public.is_reserved_will_username(username)
  );

commit;
