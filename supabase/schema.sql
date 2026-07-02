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

-- ============================================================================
-- RANKED MODE  (run this whole block once; it is idempotent — safe to re-run
-- in full any time, including just to re-apply after an earlier partial paste)
-- Siege-style ladder: one persistent `mmr` per player. New players start at
-- mmr=0 (true Bronze V floor). Visible rank = 100 mmr per division, 5
-- divisions per tier (500/tier): Bronze/Silver/Gold/Platinum/Diamond, then
-- Champion uncapped above 2500. Gain/loss uses standard Elo expected-score
-- between the two players' mmr, but the K-FACTOR is looked up from your OWN
-- pre-match mmr band, so low ranks swing up fast / down slow and high ranks
-- swing up slow / down fast — regardless of who you're matched against, and it
-- can never be gamed by a reset since mmr is permanent.
--
-- Monthly seasons: at each UTC calendar-month boundary, every player's mmr is
-- halved (NOT reset to 0) — climbing back is faster than starting over, but
-- rank is never "kept" outright. There's no cron job; the rollover is applied
-- lazily and atomically the next time a player's row is touched (queueing,
-- finishing a ranked match, or opening the Ranked tab), keyed off a stored
-- season_number so it can only ever apply once per player per season.
-- ============================================================================

-- ---------- PROFILES: ranked columns --------------------------------------
alter table public.profiles add column if not exists mmr            int not null default 0;
alter table public.profiles add column if not exists season_number  int not null default 0;
alter table public.profiles add column if not exists ranked_wins    int not null default 0;
alter table public.profiles add column if not exists ranked_losses  int not null default 0;
-- `mmr` may already exist from an earlier run of this file with default 100 —
-- ADD COLUMN IF NOT EXISTS won't retroactively change an existing column's
-- default, so set it explicitly now new signups actually start at 0.
alter table public.profiles alter column mmr set default 0;
-- One-time, narrowly-scoped cleanup: anyone still sitting at the OLD 100
-- default who has never actually finished a ranked match (0-0 record) gets
-- dropped to the new 0 start. Never touches anyone who's actually played.
update public.profiles set mmr = 0 where mmr = 100 and ranked_wins = 0 and ranked_losses = 0;

-- ---------- Tag casual multiplayer rows so ranked ones are identifiable ---
alter table public.match_lobby add column if not exists ranked boolean not null default false;
alter table public.matches    add column if not exists ranked boolean not null default false;

-- ---------- RANKED QUEUE ---------------------------------------------------
-- One row per waiting player. matched_lobby_id is set by whichever OTHER
-- client's try_ranked_match() call pairs them, so a player who didn't win the
-- race to match still discovers the pairing (via realtime or their own poll).
create table if not exists public.ranked_queue (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  joined_at        timestamptz not null default now(),
  matched_lobby_id uuid
);
alter table public.ranked_queue enable row level security;
drop policy if exists "queue see own" on public.ranked_queue;
create policy "queue see own" on public.ranked_queue for select using (auth.uid() = user_id);
drop policy if exists "queue join own" on public.ranked_queue;
create policy "queue join own" on public.ranked_queue for insert with check (auth.uid() = user_id);
drop policy if exists "queue update own" on public.ranked_queue;
create policy "queue update own" on public.ranked_queue for update using (auth.uid() = user_id);
drop policy if exists "queue leave own" on public.ranked_queue;
create policy "queue leave own" on public.ranked_queue for delete using (auth.uid() = user_id);

-- ---------- K-factor bands (keyed off the player's OWN pre-match mmr) -----
create or replace function public.ranked_k_win(m int)
returns int language sql immutable as $$
  select case when m < 500 then 60 when m < 1000 then 46 when m < 1500 then 34
              when m < 2000 then 24 else 16 end;
$$;
create or replace function public.ranked_k_loss(m int)
returns int language sql immutable as $$
  select case when m < 500 then 18 when m < 1000 then 26 when m < 1500 then 34
              when m < 2000 then 46 else 58 end;
$$;

-- ---------- Monthly seasons (UTC calendar month) ---------------------------
-- Season 1 = July 2026 (this feature's launch month), incrementing by 1 every
-- UTC calendar month after that. Purely a function of "now" - no stored state
-- needed to know what season it currently is.
create or replace function public.ranked_current_season()
returns int language sql stable as $$
  select (extract(year from (now() at time zone 'utc'))::int * 12
        + extract(month from (now() at time zone 'utc'))::int) - (2026 * 12 + 7) + 1;
$$;

-- Halve a player's mmr if they haven't been synced to the current season yet.
-- Idempotent per season (guarded by season_number), and safe to call as often
-- as you like - it's a no-op once caught up. Locks the row so two concurrent
-- callers (e.g. a queue attempt and a result write racing at a season
-- boundary) can't both apply the halving twice.
create or replace function public.ranked_rollover_user(target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare cur int; row_season int;
begin
  if target is null then return; end if;
  cur := public.ranked_current_season();
  select season_number into row_season from public.profiles where id = target for update;
  if row_season is null then return; end if;   -- no such profile
  if row_season < cur then
    update public.profiles set mmr = floor(mmr / 2.0), season_number = cur where id = target;
  end if;
end;
$$;

-- Client-callable: force-sync MY OWN row to the current season right now (so
-- opening the Ranked tab after a season flip shows the halved number
-- immediately, instead of waiting for my next queue/match touch).
create or replace function public.ranked_sync_me()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.ranked_rollover_user(auth.uid());
end;
$$;

-- ---------- Atomic matchmaking ---------------------------------------------
-- Any waiting client may call this. Returns the new lobby id if THIS caller
-- performed a match, the existing lobby id if I was already matched by someone
-- else's call, or null if nobody's available to match with right now.
--
-- Lock order matters: we lock OUR OWN row FIRST, then search for an opponent.
-- Locking self first (instead of only locking the opponent candidate) is what
-- prevents a split-brain race — without it, two players polling at nearly the
-- same instant could each grab the OTHER as opponent and create TWO separate
-- lobbies for the same pair, leaving both waiting in a lobby the other never
-- joins. With self locked first, a concurrent caller's FOR UPDATE SKIP LOCKED
-- search for an opponent skips anyone (including me) who's mid-match already,
-- so at most one lobby can ever be created per pair.
create or replace function public.try_ranked_match()
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  self_row record;
  self_mmr int;
  self_range numeric;
  opp record;
  new_lobby_id uuid;
  my_seed bigint;
  first_picker uuid;
begin
  if me is null then return null; end if;

  -- Self-clean stale rows (client vanished without leaving the queue) so they
  -- can never be matched into a lobby nobody's client is watching. 180s (not
  -- 90s) so a player with an unusual/isolated mmr isn't evicted mid-search
  -- right as the widening range below would have finally found them a match.
  delete from public.ranked_queue where joined_at < now() - interval '180 seconds' and user_id <> me;

  select * into self_row from public.ranked_queue where user_id = me for update;
  if not found then return null; end if;                          -- not queued
  if self_row.matched_lobby_id is not null then return self_row.matched_lobby_id; end if;  -- already matched

  select mmr into self_mmr from public.profiles where id = me;
  -- Skill-based matching: the acceptable mmr gap starts tight (+-75, roughly
  -- one division) and widens 5 mmr per second waited, so a fresh queue gets
  -- close matches while a long wait eventually casts a wide enough net that
  -- nobody's stuck forever (~90s -> +-525, well over a full tier). A pairing
  -- requires BOTH players' windows to accept each other (the tighter of the
  -- two governs) - otherwise someone who's waited 80s could yank a player who
  -- just joined 2s ago into a lopsided match.
  self_range := 75 + 5 * extract(epoch from (now() - self_row.joined_at));

  select q.* into opp
    from public.ranked_queue q
    join public.profiles p on p.id = q.user_id
    where q.user_id <> me and q.matched_lobby_id is null
      and self_mmr is not null and p.mmr is not null
      and abs(p.mmr - self_mmr) <= least(self_range, 75 + 5 * extract(epoch from (now() - q.joined_at)))
    order by q.joined_at asc
    limit 1
    for update of q skip locked;

  if not found then return null; end if;   -- nobody within range available right now

  my_seed := floor(random() * 2147483647)::bigint;
  first_picker := case when random() < 0.5 then me else opp.user_id end;

  -- Ranked is always Pro Mode (ratings hidden) - no casual/pro switch, it's
  -- the harder, knowledge-only ladder by design.
  insert into public.match_lobby (host, guest, pool, pro, seed, first_pick, phase, ranked)
    values (me, opp.user_id, 'club', true, my_seed, first_picker, 'formation', true)
    returning id into new_lobby_id;

  update public.ranked_queue set matched_lobby_id = new_lobby_id where user_id = me;
  update public.ranked_queue set matched_lobby_id = new_lobby_id where user_id = opp.user_id;

  return new_lobby_id;
end;
$$;

-- ---------- Record a ranked result (Elo + W/L, atomic) ---------------------
create or replace function public.record_ranked_result(winner uuid, loser uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  w_mmr int; l_mmr int; e_w numeric; e_l numeric; d_w int; d_l int;
begin
  if winner is null or loser is null or winner = loser then return; end if;

  -- Catch either player up to the current season BEFORE reading mmr, so a
  -- result that lands right on a season boundary is never scored off a stale
  -- pre-halving number.
  perform public.ranked_rollover_user(winner);
  perform public.ranked_rollover_user(loser);

  select mmr into w_mmr from public.profiles where id = winner;
  select mmr into l_mmr from public.profiles where id = loser;
  if w_mmr is null or l_mmr is null then return; end if;

  e_w := 1.0 / (1.0 + power(10, (l_mmr - w_mmr) / 400.0));
  e_l := 1.0 / (1.0 + power(10, (w_mmr - l_mmr) / 400.0));

  -- Own-mmr-banded K, floored so a result always visibly moves the number.
  d_w := greatest(1, round(public.ranked_k_win(w_mmr) * (1 - e_w)));
  d_l := least(-1, round(-1 * public.ranked_k_loss(l_mmr) * e_l));

  update public.profiles set mmr = greatest(0, mmr + d_w), ranked_wins = ranked_wins + 1 where id = winner;
  update public.profiles set mmr = greatest(0, mmr + d_l), ranked_losses = ranked_losses + 1 where id = loser;
end;
$$;

-- Enable Realtime for ranked_queue too (Database -> Publications ->
-- supabase_realtime), or run:
--   alter publication supabase_realtime add table public.ranked_queue;

-- ============================================================================
-- RANKED v2: idempotent Elo with exact deltas, forfeits, streaks, history,
-- player collection.  (Run this whole block once; idempotent, safe to re-run.)
-- ============================================================================

-- Win streak (consecutive ranked wins; any loss resets to 0).
alter table public.profiles add column if not exists ranked_streak int not null default 0;

-- Recording state lives ON the lobby row: elo_done makes the result write
-- idempotent no matter which client(s) call it, and the stored deltas mean
-- EVERY caller (including the second one) gets the exact server-computed
-- +/- for display - no more client-side mmr-diff guessing races.
alter table public.match_lobby add column if not exists elo_done  boolean not null default false;
alter table public.match_lobby add column if not exists mmr_dw    int;
alter table public.match_lobby add column if not exists mmr_dl    int;
-- What phase the lobby was in when someone left (written by leave_lobby) -
-- forfeit claims are only honored for leaves from reveal/draft/match.
alter table public.match_lobby add column if not exists done_from text;
-- Liveness heartbeats so a vanished (tab-closed) opponent is detectable.
alter table public.match_lobby add column if not exists host_seen  timestamptz;
alter table public.match_lobby add column if not exists guest_seen timestamptz;

alter table public.matches add column if not exists forfeit boolean not null default false;

-- Atomic leave: stamps WHERE the leaver left from, then closes the lobby.
create or replace function public.leave_lobby(lobby uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.match_lobby set done_from = phase, phase = 'done'
    where id = lobby and auth.uid() in (host, guest) and phase <> 'done';
end;
$$;

-- Heartbeat: refresh MY seen-at, return how stale the OPPONENT's is (seconds,
-- null if they've never beaten). All timestamps are server-side now(), so
-- client clock skew can't fake or mask an abandonment.
create or replace function public.lobby_heartbeat(lobby uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare l record; opp_seen timestamptz;
begin
  if auth.uid() is null then return null; end if;
  update public.match_lobby set
      host_seen  = case when auth.uid() = host  then now() else host_seen  end,
      guest_seen = case when auth.uid() = guest then now() else guest_seen end
    where id = lobby and auth.uid() in (host, guest);
  select * into l from public.match_lobby where id = lobby;
  if not found or auth.uid() not in (l.host, l.guest) then return null; end if;
  opp_seen := case when auth.uid() = l.host then l.guest_seen else l.host_seen end;
  if opp_seen is null then return null; end if;
  return extract(epoch from (now() - opp_seen));
end;
$$;

-- Shared Elo core: applies the mmr/W-L/streak updates for one decided ranked
-- lobby exactly once, stores the deltas on the lobby, optionally records the
-- match-history row. Returns [delta_winner, delta_loser].
create or replace function public.apply_ranked_result(l public.match_lobby, winner uuid, loser uuid,
                                                      g_host int, g_guest int, is_forfeit boolean)
returns int[] language plpgsql security definer set search_path = public as $$
declare w_mmr int; l_mmr int; e_w numeric; e_l numeric; d_w int; d_l int;
begin
  perform public.ranked_rollover_user(winner);
  perform public.ranked_rollover_user(loser);
  select mmr into w_mmr from public.profiles where id = winner;
  select mmr into l_mmr from public.profiles where id = loser;
  if w_mmr is null or l_mmr is null then return null; end if;
  e_w := 1.0 / (1.0 + power(10, (l_mmr - w_mmr) / 400.0));
  e_l := 1.0 / (1.0 + power(10, (w_mmr - l_mmr) / 400.0));
  d_w := greatest(1, round(public.ranked_k_win(w_mmr) * (1 - e_w)));
  d_l := least(-1, round(-1 * public.ranked_k_loss(l_mmr) * e_l));
  update public.profiles set mmr = greatest(0, mmr + d_w), ranked_wins = ranked_wins + 1,
      ranked_streak = greatest(ranked_streak, 0) + 1 where id = winner;
  update public.profiles set mmr = greatest(0, mmr + d_l), ranked_losses = ranked_losses + 1,
      ranked_streak = 0 where id = loser;
  update public.match_lobby set elo_done = true, mmr_dw = d_w, mmr_dl = d_l where id = l.id;
  insert into public.matches (lobby_id, player_a, player_b, goals_a, goals_b, winner, ranked, forfeit)
    values (l.id, l.host, l.guest, g_host, g_guest, winner, true, is_forfeit);
  return array[d_w, d_l];
end;
$$;

-- Record a decided ranked match. EITHER participant may call it (fixes the
-- old host-only fragility); the elo_done lock guarantees the elo/W-L/history
-- write happens exactly once, and repeat calls just return the stored deltas.
create or replace function public.record_ranked_result_lobby(lobby uuid, winner uuid, loser uuid,
                                                             goals_host int, goals_guest int)
returns int[] language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); l public.match_lobby%rowtype;
begin
  if me is null then return null; end if;
  select * into l from public.match_lobby where id = lobby for update;
  if not found or not l.ranked then return null; end if;
  if me not in (l.host, l.guest) then return null; end if;
  if winner not in (l.host, l.guest) or loser not in (l.host, l.guest) or winner = loser then return null; end if;
  if l.elo_done then return array[l.mmr_dw, l.mmr_dl]; end if;
  return public.apply_ranked_result(l, winner, loser, goals_host, goals_guest, false);
end;
$$;

-- Forfeit claim: the player who STAYED wins automatically; the leaver takes a
-- normal Elo loss they'll see next time they look at their rank. Only valid
-- when the game had really started (left from reveal/draft/match, or the
-- opponent's heartbeat has been dead 20s+) and nothing was recorded yet.
create or replace function public.claim_ranked_forfeit(lobby uuid)
returns int[] language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); l public.match_lobby%rowtype; opp uuid; opp_seen timestamptz;
begin
  if me is null then return null; end if;
  select * into l from public.match_lobby where id = lobby for update;
  if not found or not l.ranked then return null; end if;
  if me not in (l.host, l.guest) then return null; end if;
  if l.elo_done then return null; end if;
  opp := case when me = l.host then l.guest else l.host end;
  opp_seen := case when me = l.host then l.guest_seen else l.host_seen end;
  if not ( (l.phase = 'done' and coalesce(l.done_from, '') in ('reveal', 'draft', 'match'))
        or (l.phase in ('reveal', 'draft', 'match') and opp_seen is not null
            and opp_seen < now() - interval '20 seconds') ) then
    return null;
  end if;
  if l.phase <> 'done' then
    update public.match_lobby set done_from = phase, phase = 'done' where id = l.id;
  end if;
  return public.apply_ranked_result(l, me, opp, null, null, true);
end;
$$;

-- ---------- Player collection (drafted-player album) -----------------------
create table if not exists public.player_collection (
  user_id  uuid not null references auth.users(id) on delete cascade,
  name     text not null,
  club     text not null default '',
  year     int  not null default 0,
  pos      text,
  ovr      int,
  times    int not null default 1,
  first_at timestamptz default now(),
  primary key (user_id, name, club, year)
);
alter table public.player_collection enable row level security;
drop policy if exists "collection read own" on public.player_collection;
create policy "collection read own" on public.player_collection for select using (auth.uid() = user_id);

-- Batch add (called after every completed draft). Upsert bumps the times
-- counter and keeps the best OVR seen for that exact player/club/year card.
create or replace function public.collection_add(players jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or players is null then return; end if;
  insert into public.player_collection (user_id, name, club, year, pos, ovr)
  select auth.uid(), p->>'n', coalesce(p->>'club', ''), coalesce((p->>'year')::int, 0), p->>'pos', (p->>'ovr')::int
    from jsonb_array_elements(players) p
    where coalesce(p->>'n', '') <> ''
  on conflict (user_id, name, club, year) do update
    set times = public.player_collection.times + 1,
        ovr = greatest(coalesce(public.player_collection.ovr, 0), coalesce(excluded.ovr, 0));
end;
$$;

