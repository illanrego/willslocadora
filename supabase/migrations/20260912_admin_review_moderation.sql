-- Owner-only review moderation. Public review reads continue to expose only
-- visible, non-deleted rows through the existing security-definer function.
begin;

alter table public.reviews
  drop constraint if exists reviews_visibility_check;

alter table public.reviews
  add constraint reviews_visibility_check check (visibility in ('public', 'hidden'));

alter table public.reviews
  add column if not exists moderation_reason text,
  add column if not exists moderated_by text references public."user"(id) on delete restrict,
  add column if not exists moderated_at timestamptz;

alter table public.reviews
  add constraint reviews_moderation_pair check ((moderated_at is null) = (moderated_by is null));

create index reviews_moderation_newest
  on public.reviews (visibility, created_at desc);

commit;

