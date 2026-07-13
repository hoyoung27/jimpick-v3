-- 짐픽 PRO 1.7 Supabase 전체 설정
-- Supabase Dashboard → SQL Editor에서 전체 실행

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  owner_name text not null default '',
  phone text not null default '',
  email text not null default '',
  company_name text not null default '',
  company_phone text not null default '',
  business_number text not null default '',
  subscription_status text not null default 'trial',
  trial_started_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_name text not null default '',
  customer_phone text not null default '',
  move_date date,
  from_address text not null default '',
  to_address text not null default '',
  quote_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.quotes
  add column if not exists updated_at timestamptz not null default now();

create index if not exists quotes_user_created_idx
  on public.quotes(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.quotes enable row level security;

drop policy if exists "profiles own select" on public.profiles;
drop policy if exists "profiles own insert" on public.profiles;
drop policy if exists "profiles own update" on public.profiles;
drop policy if exists "quotes own all" on public.quotes;
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "quotes_select_own" on public.quotes;
drop policy if exists "quotes_insert_own" on public.quotes;
drop policy if exists "quotes_update_own" on public.quotes;
drop policy if exists "quotes_delete_own" on public.quotes;

create policy "profiles_select_own"
on public.profiles for select
using (auth.uid() = id);

create policy "profiles_insert_own"
on public.profiles for insert
with check (auth.uid() = id);

create policy "profiles_update_own"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "quotes_select_own"
on public.quotes for select
using (auth.uid() = user_id);

create policy "quotes_insert_own"
on public.quotes for insert
with check (auth.uid() = user_id);

create policy "quotes_update_own"
on public.quotes for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "quotes_delete_own"
on public.quotes for delete
using (auth.uid() = user_id);
