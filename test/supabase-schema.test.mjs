import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20260730_locadora_core.sql', import.meta.url), 'utf8');

test('Supabase schema keeps Clerk identities as opaque text IDs and never stores email or passwords', () => {
  assert.match(migration, /create table public\.profiles \([\s\S]*user_id text primary key/i);
  assert.doesNotMatch(migration, /password_hash|email\s+(text|varchar)/i);
});

test('Supabase schema restricts active rental mutations to a transaction that locks the member profile', () => {
  assert.match(migration, /create function public\.rent_titles/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /active_title_limit/i);
  assert.match(migration, /jsonb_array_length\(p_titles\) > 3/i);
});

test('Supabase repair migration qualifies return columns that collide with output variables', () => {
  const repair = readFileSync(new URL('../supabase/migrations/20260801_fix_return_rental_item.sql', import.meta.url), 'utf8');
  assert.match(repair, /update public\.rental_items as target/i);
  assert.match(repair, /where target\.id = p_rental_item_id[\s\S]*target\.returned_at is null/i);
  assert.match(repair, /update public\.rentals as rental/i);
  assert.match(repair, /where rental\.id = item\.rental_id/i);
});

test('Supabase return routine completes the watchlist only for watched titles', () => {
  assert.match(migration, /create function public\.return_rental_item/i);
  assert.match(migration, /if p_watched_status = 'watched' then/i);
  assert.match(migration, /completed_at = now\(\)/i);
  assert.match(migration, /enable row level security/i);
});

test('review migration permits half-star reviews only after a watched return', () => {
  const reviewMigrationUrl = new URL('../supabase/migrations/20260802_add_title_reviews.sql', import.meta.url);
  assert.ok(existsSync(reviewMigrationUrl), 'review migration must exist');
  const reviewMigration = readFileSync(reviewMigrationUrl, 'utf8');
  assert.match(reviewMigration, /create table public\.reviews/i);
  assert.match(reviewMigration, /rating numeric\(2, 1\)[\s\S]*rating >= 0\.5[\s\S]*rating <= 5[\s\S]*rating \* 2 = trunc\(rating \* 2\)/i);
  assert.match(reviewMigration, /create function public\.upsert_review/i);
  assert.match(reviewMigration, /watched_status = 'watched'/i);
  assert.match(reviewMigration, /raise exception 'watched_history_required'/i);
  assert.match(reviewMigration, /create function public\.get_public_title_reviews/i);
});
