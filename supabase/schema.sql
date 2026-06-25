-- ============================================================================
-- Club Champion — Supabase schema
-- Paste this whole file into the Supabase SQL Editor and run it once.
-- It creates the tables, a username-availability function, and Row Level
-- Security (RLS) policies so users can only touch their own data (and read
-- their friends' best seasons). Safe to re-run (idempotent).
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

-- ---------- FRIENDSHIPS ---------------------------------------------------
-- Created BEFORE `seasons` because the seasons "friends read seasons" policy
-- references this table.
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

-- ---------- SEASONS (saved game results) ---------------------------------
create table if not exists public.seasons (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  mode          text not null,           -- 'solo' | 'cpu' | 'ucl' | 'wc'
  formation     text,
  -- For seasons: W/D/L + points. For tournament runs (ucl/wc): wins = rounds
  -- won, losses = 0 (champion) or 1 (knocked out), unbeaten = champion.
  wins int, draws int, losses int, points int,
  goals_for int, goals_against int,
  unbeaten      boolean default false,
  squad         jsonb,                   -- the drafted XI
  player_stats  jsonb,                   -- per-player season / run stats
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

-- ---------- RANKED (reserved for the upcoming ranked mode) ---------------
-- create table if not exists public.ranked_profiles (
--   user_id uuid primary key references auth.users(id) on delete cascade,
--   elo int default 1000, wins int default 0, losses int default 0, played int default 0,
--   updated_at timestamptz default now()
-- );

-- ============================================================================
-- FRIENDS + MULTIPLAYER UPDATE  (run this whole block once; it is idempotent)
-- ============================================================================

-- ---------- PROFILES: presence + settings columns (Phase 2 + 4) ----------
alter table public.profiles add column if not exists last_seen          timestamptz;
alter table public.profiles add column if not exists username_changed_at timestamptz;
alter table public.profiles add column if not exists pro_default         boolean default false;

-- ---------- MATCH LOBBY: grey "waiting for player" expiry (Phase B) -------
alter table public.match_lobby add column if not exists lobby_expires_at timestamptz;

-- ---------- HEAD-TO-HEAD (Phase 3.2) -------------------------------------
-- One row per unordered pair (low_id < high_id). low_wins / high_wins.
create table if not exists public.head_to_head (
  low_id   uuid not null references auth.users(id) on delete cascade,
  high_id  uuid not null references auth.users(id) on delete cascade,
  low_wins  int not null default 0,
  high_wins int not null default 0,
  updated_at timestamptz default now(),
  primary key (low_id, high_id)
);
alter table public.head_to_head enable row level security;
drop policy if exists "h2h read own" on public.head_to_head;
create policy "h2h read own" on public.head_to_head for select using (auth.uid() in (low_id, high_id));
drop policy if exists "h2h upsert own" on public.head_to_head;
create policy "h2h upsert own" on public.head_to_head for insert with check (auth.uid() in (low_id, high_id));
drop policy if exists "h2h update own" on public.head_to_head;
create policy "h2h update own" on public.head_to_head for update using (auth.uid() in (low_id, high_id));

-- Atomic "record a result" helper: winner/loser are user ids.
create or replace function public.record_h2h(winner uuid, loser uuid)
returns void language plpgsql security definer set search_path = public as $$
declare lo uuid; hi uuid; win_is_low boolean;
begin
  if winner < loser then lo := winner; hi := loser; win_is_low := true;
  else lo := loser; hi := winner; win_is_low := false; end if;
  insert into public.head_to_head (low_id, high_id, low_wins, high_wins)
    values (lo, hi, case when win_is_low then 1 else 0 end, case when win_is_low then 0 else 1 end)
  on conflict (low_id, high_id) do update set
    low_wins  = public.head_to_head.low_wins  + (case when win_is_low then 1 else 0 end),
    high_wins = public.head_to_head.high_wins + (case when win_is_low then 0 else 1 end),
    updated_at = now();
end; $$;

-- ---------- REPORTS (Phase 3.4) -----------------------------------------
create table if not exists public.reports (
  id         uuid primary key default gen_random_uuid(),
  reporter   uuid not null references auth.users(id) on delete cascade,
  reported   uuid not null references auth.users(id) on delete cascade,
  reason     text not null,
  comment    text,
  created_at timestamptz default now()
);
alter table public.reports enable row level security;
drop policy if exists "file own reports" on public.reports;
create policy "file own reports" on public.reports for insert with check (auth.uid() = reporter);

-- ---------- GAME INVITES (Phase 5) --------------------------------------
create table if not exists public.game_invites (
  id         uuid primary key default gen_random_uuid(),
  from_user  uuid not null references auth.users(id) on delete cascade,
  to_user    uuid not null references auth.users(id) on delete cascade,
  status     text not null default 'pending'
             check (status in ('pending','accepted','declined','cancelled','expired')),
  pool       text not null default 'club',     -- 'club' | 'wc'
  pro        boolean default false,
  mode       text not null default 'classic',
  lobby_id   uuid,
  created_at timestamptz default now(),
  expires_at timestamptz
);
alter table public.game_invites enable row level security;
drop policy if exists "invites see own" on public.game_invites;
create policy "invites see own" on public.game_invites for select using (auth.uid() in (from_user, to_user));
drop policy if exists "invites send" on public.game_invites;
create policy "invites send" on public.game_invites for insert with check (auth.uid() = from_user);
drop policy if exists "invites respond" on public.game_invites;
create policy "invites respond" on public.game_invites for update using (auth.uid() in (from_user, to_user));

-- ---------- MATCH LOBBY (Phase 6) ---------------------------------------
create table if not exists public.match_lobby (
  id         uuid primary key default gen_random_uuid(),
  host       uuid not null references auth.users(id) on delete cascade,
  guest      uuid not null references auth.users(id) on delete cascade,
  pool       text not null default 'club',
  pro        boolean default false,
  formation  text,
  host_ready boolean default false,
  guest_ready boolean default false,
  first_pick uuid,                              -- who drafts first
  seed       bigint,                            -- shared match seed
  draft      jsonb default '{}'::jsonb,         -- live draft state
  phase      text not null default 'formation', -- formation|reveal|draft|match|done
  created_at timestamptz default now()
);
alter table public.match_lobby enable row level security;
drop policy if exists "lobby see own" on public.match_lobby;
create policy "lobby see own" on public.match_lobby for select using (auth.uid() in (host, guest));
drop policy if exists "lobby create" on public.match_lobby;
create policy "lobby create" on public.match_lobby for insert with check (auth.uid() in (host, guest));
drop policy if exists "lobby update own" on public.match_lobby;
create policy "lobby update own" on public.match_lobby for update using (auth.uid() in (host, guest));

-- ---------- MATCHES (Phase 9 — recorded multiplayer results) ------------
create table if not exists public.matches (
  id         uuid primary key default gen_random_uuid(),
  lobby_id   uuid,
  player_a   uuid not null references auth.users(id) on delete cascade,
  player_b   uuid not null references auth.users(id) on delete cascade,
  goals_a    int, goals_b int,
  winner     uuid,
  created_at timestamptz default now()
);
alter table public.matches enable row level security;
drop policy if exists "matches see own" on public.matches;
create policy "matches see own" on public.matches for select using (auth.uid() in (player_a, player_b));
drop policy if exists "matches insert own" on public.matches;
create policy "matches insert own" on public.matches for insert with check (auth.uid() in (player_a, player_b));

-- ---------- REALTIME ----------------------------------------------------
-- After running this, enable Realtime for these tables in the dashboard
-- (Database -> Publications -> supabase_realtime): friendships (done),
-- profiles, game_invites, match_lobby.  Or run:
--   alter publication supabase_realtime add table public.game_invites;
--   alter publication supabase_realtime add table public.match_lobby;
--   alter publication supabase_realtime add table public.profiles;

