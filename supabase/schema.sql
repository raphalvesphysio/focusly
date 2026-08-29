-- Cole no Supabase: SQL Editor → New query → Run

create table if not exists public.study_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.study_data enable row level security;

drop policy if exists "users_own_study_data" on public.study_data;
create policy "users_own_study_data"
  on public.study_data for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
