-- Public title reviews. Only a member with a returned, watched rental can write one.
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(user_id) on delete cascade,
  canonical_key text not null,
  rating numeric(2, 1) not null,
  body text not null,
  body_censored text not null,
  visibility text not null default 'public' check (visibility = 'public'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint reviews_canonical_key_format check (canonical_key ~ '^(movie|series):[1-9][0-9]*$'),
  constraint reviews_half_star_rating check (
    rating >= 0.5
    and rating <= 5
    and rating * 2 = trunc(rating * 2)
  ),
  constraint reviews_body_length check (char_length(body) between 1 and 1000),
  constraint reviews_one_title_per_member unique (user_id, canonical_key)
);

create index reviews_public_title_newest
  on public.reviews (canonical_key, created_at desc)
  where visibility = 'public' and deleted_at is null;

alter table public.reviews enable row level security;
revoke all on public.reviews from anon, authenticated;

create function public.upsert_review(
  p_user_id text,
  p_canonical_key text,
  p_rating numeric,
  p_body text
)
returns public.reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.reviews;
  cleaned_body text;
begin
  cleaned_body := btrim(coalesce(p_body, ''));
  if p_canonical_key !~ '^(movie|series):[1-9][0-9]*$'
    or p_rating < 0.5
    or p_rating > 5
    or p_rating * 2 <> trunc(p_rating * 2)
    or char_length(cleaned_body) not between 1 and 1000 then
    raise exception 'invalid_review' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.rental_items as rental_item
    where rental_item.user_id = p_user_id
      and rental_item.canonical_key = p_canonical_key
      and rental_item.returned_at is not null
      and rental_item.watched_status = 'watched'
  ) then
    raise exception 'watched_history_required' using errcode = 'P0001';
  end if;

  insert into public.reviews (user_id, canonical_key, rating, body, body_censored, visibility, created_at, updated_at, deleted_at)
  values (p_user_id, p_canonical_key, p_rating, cleaned_body, cleaned_body, 'public', now(), now(), null)
  on conflict (user_id, canonical_key) do update set
    rating = excluded.rating,
    body = excluded.body,
    body_censored = excluded.body_censored,
    visibility = 'public',
    updated_at = now(),
    deleted_at = null
  returning * into result;

  return result;
end;
$$;

create function public.get_public_title_reviews(p_canonical_key text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with visible_reviews as (
    select review.id, review.rating, review.body_censored, review.created_at, profile.username
    from public.reviews as review
    join public.profiles as profile on profile.user_id = review.user_id
    where review.canonical_key = p_canonical_key
      and review.visibility = 'public'
      and review.deleted_at is null
  ), recent_reviews as (
    select * from visible_reviews order by created_at desc limit 20
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'averageRating', coalesce((select round(avg(rating), 1) from visible_reviews), 0),
      'ratingCount', (select count(*) from visible_reviews)
    ),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'username', username,
        'rating', rating,
        'body', body_censored,
        'createdAt', created_at
      ) order by created_at desc)
      from recent_reviews
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.upsert_review(text, text, numeric, text) from public, anon, authenticated;
revoke all on function public.get_public_title_reviews(text) from public, anon, authenticated;
