create table if not exists public.pending_signup_otps (
  email text primary key check (email = lower(email) and char_length(email) between 3 and 254),
  full_name text not null check (char_length(full_name) between 1 and 100),
  otp_hash text not null check (otp_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.password_reset_otps (
  email text primary key check (email = lower(email) and char_length(email) between 3 and 254),
  otp_hash text not null check (otp_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  reset_token_hash text check (
    reset_token_hash is null or reset_token_hash ~ '^[a-f0-9]{64}$'
  ),
  reset_token_expires_at timestamptz,
  reset_token_used_at timestamptz
);

create index if not exists pending_signup_otps_expires_idx
  on public.pending_signup_otps(expires_at);
create index if not exists password_reset_otps_expires_idx
  on public.password_reset_otps(expires_at);

alter table public.pending_signup_otps enable row level security;
alter table public.password_reset_otps enable row level security;

revoke all on public.pending_signup_otps from public, anon, authenticated;
revoke all on public.password_reset_otps from public, anon, authenticated;
grant select, insert, update, delete on public.pending_signup_otps to service_role;
grant select, insert, update, delete on public.password_reset_otps to service_role;

notify pgrst, 'reload schema';
