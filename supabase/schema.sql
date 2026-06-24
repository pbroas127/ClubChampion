-- ============================================================================
-- Club Champion — Supabase schema
-- Paste this whole file into the Supabase SQL Editor and run it once.
-- It creates the tables, a username-availability function, and Row Level
-- Security (RLS) policies so users can only touch their own data (and read
-- their friends' best seasons).
-- ============================================================================

-- ---------- PROFILES (1:1 with auth.users) -------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text unique not null check (char_length(username) between 3 and 20),
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;

drop policy if exists "profiles readable by all" on public.profiles;
create policy "profiles readable by all" on public.profiles for select using (true);
drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update using (auth.uid() = id);

-- Case-insensitive username availability check (callable before signup).
create or replace function public.username_available(name text)
returns boolean
language sql security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(name));
$$;

-- ---------- SEASONS (saved game results) ---------------------------------
create table if not exists public.seasons (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  mode          text not null,           -- 'solo' | 'cpu'
  formation     text,
  wins int, draws int, losses int, points int,
  goals_for int, goals_against int,
  unbeaten      boolean default false,
  squad         jsonb,                   -- the drafted XI
  player_stats  jsonb,                   -- per-player season stats
  created_at    timestamptz default now()
);
alter table public.seasons enable row level security;

drop policy if exists "read own seasons" on public.seasons;
create policy "read own seasons" on public.seasons for select using (auth.uid() = user_id);

drop policy if exists "friends read seasons" on public.seasons;
create policy "friends read seasons" on public.seasons for select using (
  exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ( (f.requester = auth.uid() and f.addressee = seasons.user_id)
         or (f.addressee = auth.uid() and f.requester = seasons.user_id) )
  )
);

drop policy if exists "insert own seasons" on public.seasons;
create policy "insert own seasons" on public.seasons for insert with check (auth.uid() = user_id);

-- ---------- FRIENDSHIPS ---------------------------------------------------
create table if not exists public.friendships (
  id         uuid primary key default gen_random_uuid(),
  requester  uuid not null references auth.users(id) on delete cascade,
  addressee  uuid not null references auth.users(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz default now(),
  unique (requester, addressee)
);
alter table public.friendships enable row level security;

drop policy if exists "see own friendships" on public.friendships;
create policy "see own friendships" on public.friendships for select using (auth.uid() in (requester, addressee));
drop policy if exists "send requests" on public.friendships;
create policy "send requests" on public.friendships for insert with check (auth.uid() = requester);
drop policy if exists "respond to requests" on public.friendships;
create policy "respond to requests" on public.friendships for update using (auth.uid() = addressee);
drop policy if exists "remove friendships" on public.friendships;
create policy "remove friendships" on public.friendships for delete using (auth.uid() in (requester, addressee));

-- ---------- RANKED (reserved for the upcoming ranked mode) ---------------
-- create table if not exists public.ranked_profiles (
--   user_id uuid primary key references auth.users(id) on delete cascade,
--   elo int default 1000, wins int default 0, losses int default 0, played int default 0,
--   updated_at timestamptz default now()
-- );
