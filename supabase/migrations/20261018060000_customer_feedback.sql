create table if not exists public.customer_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('general', 'product', 'delivery', 'website', 'support')),
  rating smallint not null check (rating between 1 and 5),
  message text not null check (char_length(message) between 10 and 2000),
  status text not null default 'new' check (status in ('new', 'reviewed', 'resolved')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_feedback_created_idx
  on public.customer_feedback(created_at desc);
create index if not exists customer_feedback_status_created_idx
  on public.customer_feedback(status, created_at desc);
create index if not exists customer_feedback_user_created_idx
  on public.customer_feedback(user_id, created_at desc);

alter table public.customer_feedback enable row level security;
revoke all on public.customer_feedback from public, anon, authenticated;
grant select, insert, update, delete on public.customer_feedback to service_role;

notify pgrst, 'reload schema';
