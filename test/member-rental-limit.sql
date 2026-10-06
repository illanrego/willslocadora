-- Run against an isolated database after the core and rental-limit migrations.
-- Never run this test against production.
begin;
insert into public.profiles(user_id, username) values ('limit-test', 'limit_test');
do $$
declare batch jsonb; count_before integer;
begin
  if (select rental_limit from public.profiles where user_id = 'limit-test') <> 3 then raise exception 'default'; end if;
  begin
    update public.profiles set rental_limit = 11 where user_id = 'limit-test';
    raise exception 'accepted eleven';
  exception when check_violation then null; end;
  begin
    update public.profiles set rental_limit = 0 where user_id = 'limit-test';
    raise exception 'accepted zero';
  exception when check_violation then null; end;
  select jsonb_agg(jsonb_build_object('canonical_key', 'movie:' || n, 'tmdb_id', n, 'title_type', 'movie', 'title_snapshot', 'Test tape')) into batch from generate_series(1, 10) n;
  begin
    perform public.rent_titles('limit-test', batch);
    raise exception 'default accepted ten';
  exception when raise_exception then if sqlerrm <> 'active_title_limit' then raise; end if; end;
  update public.profiles set rental_limit = 10 where user_id = 'limit-test';
  perform public.rent_titles('limit-test', batch);
  if (select count(*) from public.rental_items where user_id = 'limit-test' and returned_at is null) <> 10 then raise exception 'ten not rented'; end if;
  update public.profiles set rental_limit = 1 where user_id = 'limit-test';
  if (select count(*) from public.rental_items where user_id = 'limit-test' and returned_at is null) <> 10 then raise exception 'lowering returned rentals'; end if;
  batch := '[{"canonical_key":"movie:11","tmdb_id":11,"title_type":"movie","title_snapshot":"Eleven"}]';
  begin
    perform public.rent_titles('limit-test', batch);
    raise exception 'lowered limit permitted rent';
  exception when raise_exception then if sqlerrm <> 'active_title_limit' then raise; end if; end;
  update public.rental_items set returned_at = now(), watched_status = 'unknown' where user_id = 'limit-test';
  perform public.rent_titles('limit-test', batch);
  if (select count(*) from public.rental_items where user_id = 'limit-test' and returned_at is null) <> 1 then raise exception 'one not rented'; end if;
end $$;
rollback;
