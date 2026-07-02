-- ============================================================================
-- CLUB CHAMPION  Shop / Locker / entitlements
-- ----------------------------------------------------------------------------
-- Run this against the same Supabase project as schema.sql, after it. Additive
-- only - doesn't touch any existing table's columns except adding 3 nullable
-- columns to profiles.
-- ============================================================================

-- ---------------------------------------------------------------- CATALOG ---
create table if not exists public.shop_items (
  id            text primary key,              -- slug, e.g. 'kit_arg_2026', 'bundle_wc_favorites'
  category      text not null check (category in ('kit', 'ball', 'skin', 'bundle')),
  name          text not null,
  description   text not null default '',
  price_cents   int  not null default 0,        -- 0 = free (e.g. the default skin)
  image_url     text,                           -- null for CSS-only skins
  bundle_of     text[],                         -- item ids this bundle grants (null for non-bundles)
  stripe_price_id text,                         -- filled in once you create the Price in Stripe
  release_at    timestamptz default now(),      -- drives the "NEW" badge (< 14 days old)
  sort_order    int not null default 0,
  active        bool not null default true
);
alter table public.shop_items enable row level security;
drop policy if exists "shop catalog readable by all" on public.shop_items;
create policy "shop catalog readable by all" on public.shop_items for select using (active = true);
-- No insert/update/delete policy for authenticated/anon - catalog is managed
-- via the SQL editor or a future admin tool, never directly by players.

-- ------------------------------------------------------------ ENTITLEMENTS --
-- What each user owns. Deliberately NOT client-writable (no insert policy for
-- authenticated) - the only way to gain a row is the Stripe webhook (service
-- role, bypasses RLS) or the free-item grant inside equip_item() below. This
-- is what stops a client from just granting itself paid items.
create table if not exists public.entitlements (
  user_id     uuid not null references auth.users(id) on delete cascade,
  item_id     text not null references public.shop_items(id),
  source      text not null default 'stripe' check (source in ('stripe', 'free', 'promo')),
  acquired_at timestamptz default now(),
  primary key (user_id, item_id)
);
alter table public.entitlements enable row level security;
drop policy if exists "entitlements readable by owner" on public.entitlements;
create policy "entitlements readable by owner" on public.entitlements for select using (auth.uid() = user_id);

-- --------------------------------------------------------- EQUIPPED SLOTS ---
alter table public.profiles add column if not exists equipped_kit  text references public.shop_items(id);
alter table public.profiles add column if not exists equipped_ball text references public.shop_items(id);
alter table public.profiles add column if not exists equipped_skin text references public.shop_items(id);
-- profiles already has an "update own profile" RLS policy (auth.uid() = id),
-- but equipping still goes through the RPC below rather than a raw client
-- UPDATE, so ownership is verified server-side instead of trusted from the client.

-- Equip an owned item into its category slot. Verifies ownership (or that the
-- item is free) before writing, so a client can't equip something it never
-- bought by just calling profiles.update() directly.
create or replace function public.equip_item(p_item_id text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  it record;
  owns boolean;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into it from public.shop_items where id = p_item_id and active = true;
  if not found then raise exception 'unknown item'; end if;
  if it.category not in ('kit', 'ball', 'skin') then raise exception 'not equippable'; end if;

  owns := it.price_cents = 0 or exists (
    select 1 from public.entitlements where user_id = me and item_id = p_item_id
  );
  if not owns then raise exception 'item not owned'; end if;

  if it.category = 'kit' then
    update public.profiles set equipped_kit = p_item_id where id = me;
  elsif it.category = 'ball' then
    update public.profiles set equipped_ball = p_item_id where id = me;
  else
    update public.profiles set equipped_skin = p_item_id where id = me;
  end if;
end;
$$;
grant execute on function public.equip_item(text) to authenticated;

-- Redeem a bundle: grants entitlements for every item it contains. Called by
-- the Stripe webhook (service role) after a bundle purchase - not directly
-- callable in a way that grants anything for free (see grant below).
create or replace function public.grant_bundle_entitlements(p_user_id uuid, p_bundle_id text)
returns void language plpgsql security definer set search_path = public as $$
declare
  contents text[];
begin
  select bundle_of into contents from public.shop_items where id = p_bundle_id and category = 'bundle';
  if contents is null then return; end if;
  insert into public.entitlements (user_id, item_id, source)
    select p_user_id, unnest(contents), 'stripe'
  on conflict (user_id, item_id) do nothing;
  insert into public.entitlements (user_id, item_id, source) values (p_user_id, p_bundle_id, 'stripe')
  on conflict (user_id, item_id) do nothing;
end;
$$;
-- Deliberately no grant to `authenticated` here - only the service role
-- (Stripe webhook, which uses the service_role key and bypasses grants
-- entirely) should ever call this.

-- ================================================================ SHOP READ HELPERS
-- Everything a signed-in user needs for the Shop/Locker screens in one call.
create or replace function public.my_locker()
returns table (item_id text, category text, name text, image_url text, equipped boolean)
language sql security definer set search_path = public as $$
  select si.id, si.category, si.name, si.image_url,
    si.id in (
      select p.equipped_kit from public.profiles p where p.id = auth.uid()
      union select p.equipped_ball from public.profiles p where p.id = auth.uid()
      union select p.equipped_skin from public.profiles p where p.id = auth.uid()
    )
  from public.entitlements e
  join public.shop_items si on si.id = e.item_id
  where e.user_id = auth.uid() and si.category in ('kit', 'ball', 'skin')
  order by e.acquired_at desc;
$$;
grant execute on function public.my_locker() to authenticated;

-- ============================================================================
-- PUSH NOTIFICATIONS
-- ============================================================================
create table if not exists public.device_tokens (
  user_id    uuid not null references auth.users(id) on delete cascade,
  token      text not null,
  platform   text not null check (platform in ('ios', 'android')),
  updated_at timestamptz default now(),
  primary key (user_id, token)
);
alter table public.device_tokens enable row level security;
drop policy if exists "device tokens own only" on public.device_tokens;
create policy "device tokens own only" on public.device_tokens for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Per-user push toggle, so "daily nudge" sends respect an opt-out without
-- needing to touch device_tokens rows. Defaults on; Settings gets a toggle.
alter table public.profiles add column if not exists push_nudges_enabled boolean not null default true;

-- Fire-and-forget call into the send-push Edge Function (see
-- supabase/functions/send-push). Requires the pg_net extension, which
-- Supabase enables by default on new projects; if `create extension pg_net`
-- errors as already-installed that's fine, it's idempotent.
create extension if not exists pg_net;

create or replace function public.notify_push(p_user_id uuid, p_type text, p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := current_setting('app.settings.send_push_url', true),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || current_setting('app.settings.send_push_secret', true)),
    body := jsonb_build_object('user_id', p_user_id, 'type', p_type, 'title', p_title, 'body', p_body, 'data', p_data)
  );
exception when others then
  -- Never let a notification failure break the action that triggered it
  -- (e.g. sending a friend invite must succeed even if push delivery fails).
  null;
end;
$$;
-- One-time setup (run once per project, replace with your real values):
--   alter database postgres set app.settings.send_push_url = 'https://<project-ref>.supabase.co/functions/v1/send-push';
--   alter database postgres set app.settings.send_push_secret = '<a random secret, also set as SEND_PUSH_SECRET in the function>';

-- Trigger: a new game invite pushes to the recipient immediately, whether or
-- not their app is foregrounded (this is why it's a DB trigger, not a client
-- call - a client-side send only fires if the SENDER's app is open, but the
-- push needs to reach the RECIPIENT even if theirs isn't).
create or replace function public.on_game_invite_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  from_name text;
begin
  select username into from_name from public.profiles where id = new.from_user;
  perform public.notify_push(
    new.to_user, 'invite',
    'Match invite',
    coalesce(from_name, 'A friend') || ' invited you to play',
    jsonb_build_object('from_user', new.from_user, 'invite_id', new.id)
  );
  return new;
end;
$$;
drop trigger if exists trg_game_invite_notify on public.game_invites;
create trigger trg_game_invite_notify after insert on public.game_invites
  for each row execute function public.on_game_invite_notify();

-- Daily "you're still Bronze" nudge - meant to be run on a schedule (Supabase
-- Dashboard → Database → Cron Jobs → e.g. `select public.send_daily_nudges();`
-- once a day). mmr bands match the ranked ladder defined above (100/division,
-- 500/tier: Bronze 0-499, Silver 500-999, Gold 1000-1499, ...). Only messages
-- players below Gold who haven't finished a ranked match in 3+ days, have a
-- device token to reach, and haven't opted out.
create or replace function public.send_daily_nudges()
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  tier_name text;
begin
  for r in
    select p.id as user_id, p.mmr,
      (select max(m.created_at) from public.matches m where p.id in (m.player_a, m.player_b)) as last_played
    from public.profiles p
    where p.push_nudges_enabled = true
      and p.mmr < 1000  -- Bronze or Silver
      and exists (select 1 from public.device_tokens dt where dt.user_id = p.id)
  loop
    if r.last_played is not null and r.last_played > now() - interval '3 days' then continue; end if;
    tier_name := case when r.mmr < 500 then 'Bronze' else 'Silver' end;
    perform public.notify_push(
      r.user_id, 'nudge',
      'Climb the ladder',
      'You''re still ' || tier_name || ' — jump back in and grind a few games.',
      '{}'::jsonb
    );
  end loop;
end;
$$;

-- New shop drop / limited mode announcement - call manually (or from a small
-- admin script) when you publish new items: `select public.notify_new_drop('New kits just dropped');`
create or replace function public.notify_new_drop(p_message text)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in
    select distinct dt.user_id
    from public.device_tokens dt
    join public.profiles p on p.id = dt.user_id and p.push_nudges_enabled = true
  loop
    perform public.notify_push(r.user_id, 'drop', 'New in the Shop', p_message, '{}'::jsonb);
  end loop;
end;
$$;

-- ============================================================================
-- STARTER CATALOG (placeholder art)
-- ----------------------------------------------------------------------------
-- image_url is left null for every row below on purpose - real kit/ball art
-- (Higgsfield-generated PNGs) is a separate follow-up pass so we don't burn
-- generation credits before the catalog shape/pricing is final. The client
-- (js/shop.js:thumbHTML) renders a colored placeholder tile + category emoji
-- for any item with a null image_url, so the Shop/Locker are fully usable
-- end-to-end right now. Swap in real URLs later with:
--   update public.shop_items set image_url = '...' where id = '...';
-- `on conflict do nothing` makes this safe to re-run.
-- ============================================================================

-- -- Kits ($1.99 each) --------------------------------------------------------
insert into public.shop_items (id, category, name, description, price_cents, sort_order) values
  ('kit_argentina',    'kit', 'Argentina Home',   'Sky blue & white stripes.', 199, 1),
  ('kit_brazil',       'kit', 'Brazil Home',      'Iconic canary yellow.',      199, 2),
  ('kit_france',       'kit', 'France Home',      'Les Bleus royal blue.',      199, 3),
  ('kit_england',      'kit', 'England Home',     'Classic Three Lions white.', 199, 4),
  ('kit_portugal',     'kit', 'Portugal Home',    'Deep red & green trim.',     199, 5),
  ('kit_spain',        'kit', 'Spain Home',       'La Roja red.',               199, 6),
  ('kit_germany',      'kit', 'Germany Home',     'Crisp white & black.',       199, 7),
  ('kit_italy',        'kit', 'Italy Home',       'Azzurri blue.',              199, 8),
  ('kit_argentina_98', 'kit', 'Argentina ''98 Retro', 'Throwback stripes from a golden era.', 199, 9),
  ('kit_brazil_02',    'kit', 'Brazil ''02 Retro',    'Yellow that won it all.',              199, 10),
  ('kit_germany_14',   'kit', 'Germany ''14 Retro',   'The kit that lifted the trophy in Rio.', 199, 11)
on conflict (id) do nothing;

-- -- Match balls ($0.99 each) -------------------------------------------------
insert into public.shop_items (id, category, name, description, price_cents, sort_order) values
  ('ball_fevernova', 'ball', 'Fevernova',  'Early-2000s tournament classic.', 99, 1),
  ('ball_teamgeist', 'ball', 'Teamgeist',  'Smooth panel-less design.',       99, 2),
  ('ball_jabulani',  'ball', 'Jabulani',   'Bright, unpredictable flight.',   99, 3),
  ('ball_brazuca',   'ball', 'Brazuca',    'Fan-voted tournament ball.',      99, 4),
  ('ball_telstar18', 'ball', 'Telstar 18', 'Modern take on a retro icon.',   99, 5),
  ('ball_al_rihla',   'ball', 'Al Rihla',   '"The Journey" - fastest ball yet.', 99, 6),
  ('ball_finale',    'ball', 'Finale',     'Continental cup finale edition.', 99, 7),
  ('ball_golden',    'ball', 'Golden Ball', 'Gold-finish collector''s ball.', 99, 8)
on conflict (id) do nothing;

-- -- Match sim skins (CSS-only, no image asset needed) -----------------------
insert into public.shop_items (id, category, name, description, price_cents, sort_order) values
  ('skin_classic_green', 'skin', 'Classic Green', 'The default pitch. Always free.', 0,   1),
  ('skin_night',          'skin', 'Night',          'Floodlit night-match atmosphere.', 199, 2),
  ('skin_snow',           'skin', 'Snow',           'Play through a snowy pitch.',      199, 3),
  ('skin_rain',           'skin', 'Rain',           'Wet-weather, moody tones.',        199, 4),
  ('skin_retro_crt',      'skin', 'Retro CRT',      'Neon-on-black arcade throwback.',  199, 5),
  ('skin_golden_hour',    'skin', 'Golden Hour',    'Warm sunset kickoff.',             199, 6)
on conflict (id) do nothing;

-- -- Bundles -------------------------------------------------------------------
insert into public.shop_items (id, category, name, description, price_cents, bundle_of, sort_order) values
  ('bundle_wc_favorites', 'bundle', '2026 World Cup Favorites',
    'Argentina, Portugal, Spain, France, England & Brazil kits.', 799,
    array['kit_argentina','kit_portugal','kit_spain','kit_france','kit_england','kit_brazil'], 1),
  ('bundle_retro_legends', 'bundle', 'Retro Legends Collection',
    'Three throwback kits from football''s golden eras.', 399,
    array['kit_argentina_98','kit_brazil_02','kit_germany_14'], 2),
  ('bundle_wc_balls', 'bundle', 'World Cup Ball Collection',
    'Six tournament match balls in one drop.', 399,
    array['ball_fevernova','ball_teamgeist','ball_jabulani','ball_brazuca','ball_telstar18','ball_al_rihla'], 3),
  ('bundle_weather_pack', 'bundle', 'Weather Pack',
    'Night, Snow & Rain match-sim skins.', 499,
    array['skin_night','skin_snow','skin_rain'], 4)
on conflict (id) do nothing;
