-- Credential-free pairing for the private Samsung TV app.
-- The TV receives revocable bearer tokens only after a signed-in web member
-- authorizes the short-lived code shown on the TV.
create table if not exists public.tv_pairing_challenges (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  user_id text references public."user"(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  authorized_at timestamptz,
  claimed_at timestamptz
);

create index if not exists tv_pairing_challenges_expiry
  on public.tv_pairing_challenges (expires_at);

create table if not exists public.tv_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public."user"(id) on delete cascade,
  token_hash text not null unique,
  label text not null default 'Samsung TV',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists tv_device_tokens_user_id
  on public.tv_device_tokens (user_id, created_at desc);

alter table public.tv_pairing_challenges enable row level security;
alter table public.tv_device_tokens enable row level security;
revoke all on public.tv_pairing_challenges, public.tv_device_tokens from anon, authenticated;
