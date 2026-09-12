import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20260730_locadora_core.sql', import.meta.url), 'utf8');

test('Locadora domain schema keeps member IDs opaque and separate from auth credentials', () => {
  assert.match(migration, /create table public\.profiles \([\s\S]*user_id text primary key/i);
  assert.doesNotMatch(migration, /password_hash|email\s+(text|varchar)/i);
});

test('Better Auth schema stores credentials in protected auth tables', () => {
  const authMigration = readFileSync(new URL('../supabase/migrations/20260905_better_auth.sql', import.meta.url), 'utf8');
  assert.match(authMigration, /create table if not exists public\."user"/i);
  assert.match(authMigration, /issuer text not null/i);
  assert.match(authMigration, /password text/i);
  assert.match(authMigration, /enable row level security/i);
});

test('production Better Auth uses uncached Hyperdrive with request-scoped pg connections', () => {
  const worker = readFileSync(new URL('../workers/locadora-data/src/index.mjs', import.meta.url), 'utf8');
  const wrangler = readFileSync(new URL('../workers/locadora-data/wrangler.toml', import.meta.url), 'utf8');
  assert.match(wrangler, /\[\[hyperdrive\]\][\s\S]*binding = "HYPERDRIVE"[\s\S]*id = "e505f45c414a4fff8171530f30a64158"/i);
  assert.doesNotMatch(worker, /let authPool/);
  assert.match(worker, /new Pool\(\{ connectionString, max: 1/);
  assert.match(worker, /finally \{\s*await runtime\.close\(\);/);
});

test('Better Auth queues Resend verification and password-reset mail from the private Worker', () => {
  const worker = readFileSync(new URL('../workers/locadora-data/src/index.mjs', import.meta.url), 'utf8');
  const wrangler = readFileSync(new URL('../workers/locadora-data/wrangler.toml', import.meta.url), 'utf8');
  assert.match(worker, /https:\/\/api\.resend\.com\/emails/);
  assert.match(worker, /emailVerification:[\s\S]*sendVerificationEmail/);
  assert.match(worker, /emailAndPassword:[\s\S]*sendResetPassword/);
  assert.match(worker, /ctx\.waitUntil\(task\)/);
  assert.match(wrangler, /RESEND_FROM_EMAIL = "Will's Locadora <contato@mail\.sitedoillan\.com\.br>"/);
});

test('Better Auth forward migration repairs the required account issuer', () => {
  const repair = readFileSync(new URL('../supabase/migrations/20260906_fix_better_auth_account_schema.sql', import.meta.url), 'utf8');
  assert.match(repair, /add column if not exists issuer text/i);
  assert.match(repair, /set issuer = "providerId"/i);
  assert.match(repair, /alter column issuer set not null/i);
  assert.match(repair, /drop constraint if exists "account_providerId_accountId_key"/i);
  assert.match(repair, /constraint account_issuer_account_id_key unique \(issuer, "accountId"\)/i);
});

test('Better Auth profile reconciliation removes legacy identities and enforces one synchronized member profile', () => {
  const reconciliation = readFileSync(new URL('../supabase/migrations/20260906_fix_better_auth_account_schema.sql', import.meta.url), 'utf8');
  assert.match(reconciliation, /delete from public\."user"[\s\S]*username = 'willl'/i);
  assert.match(reconciliation, /delete from public\.profiles[\s\S]*username = 'will'[\s\S]*username = 'diegoasr'/i);
  assert.match(reconciliation, /foreign key \(user_id\) references public\."user"\(id\) on delete cascade/i);
  assert.match(reconciliation, /create trigger sync_better_auth_profile[\s\S]*after insert or update of username/i);
  assert.match(reconciliation, /create or replace function public\.set_member_username/i);
  assert.match(reconciliation, /update public\."user"[\s\S]*set username = p_username/i);
});

test('Will-like usernames are reserved for the owner email at the database boundary', () => {
  const protection = readFileSync(new URL('../supabase/migrations/20260907_protect_will_identity.sql', import.meta.url), 'utf8');
  assert.match(protection, /create or replace function public\.is_reserved_will_username/i);
  assert.match(protection, /regexp_replace\([\s\S]*\[il1\]/i);
  assert.match(protection, /lower\(email\) = 'emaildoillan@protonmail\.com'/i);
  assert.match(protection, /user_username_reserved_will/i);
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

test('saved collections migration preserves watchlist rows and isolates collection memberships', () => {
  const collectionMigration = readFileSync(new URL('../supabase/migrations/20260803_saved_title_collections.sql', import.meta.url), 'utf8');
  assert.match(collectionMigration, /create table public\.saved_title_memberships/i);
  assert.match(collectionMigration, /insert into public\.saved_title_memberships[\s\S]*from public\.watchlist_items/i);
  assert.match(collectionMigration, /'watch_later'/i);
  assert.match(collectionMigration, /unique \(user_id, canonical_key, collection\)/i);
  assert.match(collectionMigration, /collection text not null check \(collection in \('watch_later', 'favorite'\)\)/i);
  assert.match(collectionMigration, /create function public\.save_saved_title_membership/i);
  assert.match(collectionMigration, /create function public\.remove_saved_title_membership/i);
  assert.match(collectionMigration, /create or replace function public\.return_rental_item/i);
  assert.match(collectionMigration, /saved_title_memberships[\s\S]*collection = 'watch_later'/i);
});

test('catalogue blocks are reversible, owner-attributed, and unique while active', () => {
  const blockMigration = readFileSync(new URL('../supabase/migrations/20260911_catalogue_blocks.sql', import.meta.url), 'utf8');
  assert.match(blockMigration, /create table public\.catalogue_blocks/i);
  assert.match(blockMigration, /title_type text not null check \(title_type in \('movie', 'series'\)\)/i);
  assert.match(blockMigration, /tmdb_id bigint not null check \(tmdb_id > 0\)/i);
  assert.match(blockMigration, /canonical_key text generated always as \(title_type \|\| ':' \|\| tmdb_id::text\) stored/i);
  assert.match(blockMigration, /created_by text not null references public\."user"\(id\)/i);
  assert.match(blockMigration, /removed_by text references public\."user"\(id\)/i);
  assert.match(blockMigration, /catalogue_blocks_one_active_title[\s\S]*where removed_at is null/i);
  assert.match(blockMigration, /catalogue_blocks_restore_pair/i);
  assert.match(blockMigration, /enable row level security/i);
});

test('blocked catalogue titles cannot enter new saved or rental state', () => {
  const stateMigration = readFileSync(new URL('../supabase/migrations/20260913_blocked_member_state.sql', import.meta.url), 'utf8');
  assert.match(stateMigration, /create or replace function public\.reject_blocked_catalogue_state/i);
  assert.match(stateMigration, /where canonical_key = new\.canonical_key and removed_at is null/i);
  assert.match(stateMigration, /raise exception 'catalogue_title_blocked'/i);
  assert.match(stateMigration, /saved_title_memberships_reject_blocked/i);
  assert.match(stateMigration, /rental_items_reject_blocked/i);
});

test('review moderation keeps hidden rows auditable and outside public visibility', () => {
  const moderation = readFileSync(new URL('../supabase/migrations/20260912_admin_review_moderation.sql', import.meta.url), 'utf8');
  const reviewMigration = readFileSync(new URL('../supabase/migrations/20260802_add_title_reviews.sql', import.meta.url), 'utf8');
  assert.match(moderation, /drop constraint if exists reviews_visibility_check/i);
  assert.match(moderation, /visibility in \('public', 'hidden'\)/i);
  assert.match(moderation, /moderation_reason text/i);
  assert.match(moderation, /moderated_by text references public\."user"\(id\)/i);
  assert.match(moderation, /reviews_moderation_pair/i);
  assert.match(reviewMigration, /visibility = 'public'/i);
});
