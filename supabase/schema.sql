-- Run this in the Supabase SQL Editor:
-- Dashboard → your project → SQL Editor → New query → paste → Run.
--
-- Safe to re-run. Every statement is idempotent, so pasting the whole file
-- again after an edit migrates an existing database rather than failing.

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, holds the display name and Stripe customer.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  email              text,
  stripe_customer_id text unique,
  created_at         timestamptz not null default now()
);

-- Added after the first version of this file — this is why the whole thing is
-- written to be re-runnable.
alter table public.profiles add column if not exists full_name text;

-- Stamped the moment a free trial starts. Its only job is to answer "has this
-- account already had its one free trial?" — the subscription row itself gets
-- deleted-and-recreated over a lifetime, this doesn't.
alter table public.profiles add column if not exists trial_started_at timestamptz;

-- ---------------------------------------------------------------------------
-- subscriptions: mirrors the Stripe subscription, kept in sync by the webhook.
-- This table is the source of truth the app reads when gating /premium.
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users (id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_customer_id     text not null,
  -- active | trialing | past_due | canceled | incomplete | incomplete_expired | paused | unpaid
  status                 text not null,
  price_id               text,
  plan                   text check (plan in ('monthly', 'yearly')),
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- When the free trial ends. Null on subscriptions that never had one.
alter table public.subscriptions add column if not exists trial_end timestamptz;

-- A card-less trial has nothing to charge. This says whether one has been
-- added since — i.e. whether the trial will convert or be cancelled.
alter table public.subscriptions
  add column if not exists has_payment_method boolean not null default false;

create index if not exists subscriptions_user_id_idx on public.subscriptions (user_id);
create index if not exists subscriptions_customer_idx on public.subscriptions (stripe_customer_id);

-- ---------------------------------------------------------------------------
-- Row Level Security.
--
-- Read-only for the owner. There are deliberately NO insert/update/delete
-- policies: only the webhook writes here, and it uses the service-role key
-- which bypasses RLS. That means a user cannot grant themselves premium by
-- calling the Supabase API directly from the browser.
-- ---------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.subscriptions enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "read own subscriptions" on public.subscriptions;
create policy "read own subscriptions"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Create a profile row automatically whenever someone signs up.
--
-- full_name arrives in raw_user_meta_data because the signup form passes it as
-- options.data — see signUp() in app/login/actions.ts.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), '')
  )
  on conflict (id) do update
    set email     = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Keep updated_at honest.
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists subscriptions_touch_updated_at on public.subscriptions;
create trigger subscriptions_touch_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();
