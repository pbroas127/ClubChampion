# ⚽ Club Champion

**Spin a club and an exact year, draft the legend, and find out if your squad can go a whole season unbeaten.**

A football (soccer) take on the viral [82-0](https://www.82-0.com/) basketball builder. Instead of NBA teams and decades, you draft from the great club sides of **1990–2026** by their **exact year** — Maradona's *Napoli 1990*, the *Arsenal 2004* Invincibles, *Barcelona 2011*, *PSG 2025*… or a genuine dud like *Man City 1999* (third tier). Build a 7-player squad, then a non-linear engine simulates a 38-game season and tells you how you did.

Play **solo** to chase a perfect unbeaten season, or **against the CPU** — out-draft a rival manager, then settle it in a one-off final.

> A for-fun tribute project. Player ratings are subjective and made for play, not historical accuracy.

---

## How to play

1. **Pick a formation.** Every shape fields the same **7 players** (1 GK + 6 outfield), but the trade-offs differ:
   | Formation | Shape (DEF-MID-FWD) | Identity |
   |---|---|---|
   | **2-2-2** | 2 · 2 · 2 | Balanced — no weakness to exploit |
   | **3-2-1** | 3 · 2 · 1 | Catenaccio — concede nothing |
   | **2-3-1** | 2 · 3 · 1 | Tiki-Taka — dominate the middle |
   | **1-2-3** | 1 · 2 · 3 | All-Out Attack — outscore everyone |
2. **Spin the slot machine.** Each round locks in a random **club** + an **exact year (1990–2026)**.
3. **Draft a player** from that club & year to fill an open position. No player twice.
4. **Use your skips.** One **Year** skip (same club, new year) and one **Club** skip (fresh club). A bad roll early is a hole you can't dig out of.
5. **Simulate the season** and chase **0 losses**.

**Pro Mode** hides all ratings — draft on football knowledge alone.

---

## How players are ranked & scored

Each player has five attributes (1–99): **Attack, Creativity, Defence, Physical, Goalkeeping.**

The season engine ([`js/engine.js`](js/engine.js)):

1. **Sums** each category across your whole squad — so more forwards means more attack but less defence (the formation tension).
2. Compares each total to a **"par"** to get a ratio, then combines them with a **weighted geometric mean**. This is the key mechanic: **every category is gated**, so one weak area (no real keeper, a paper-thin defence) drags down the *whole* squad — exactly like 82-0's "you need rim protection."
3. Runs the resulting strength through a **non-linear win curve** over 38 games against a league of fellow greats. The last few wins are brutally expensive.
4. **Only a squad with no weak link can finish unbeaten** (0 losses) — the football equivalent of "82-0."

**Verdicts:** Relegation Battle → Mid-table → Europe-bound → Title Challengers → Title Winners → **Unbeaten (Invincible)** → Perfect (38-0-0, essentially mythical).

### Playing the CPU
The CPU drafts with the same slot machine. Difficulty controls how smart it is:
- **Easy** — grabs random decent options, leaves holes.
- **Normal** — takes the best player on the board.
- **Hard** — maximises whole-squad strength and spends its skips to dodge weak rolls.

After both squads are built, you each get a projected season **and** play a one-off final to crown a winner.

---

## Run locally

It's a pure static site — no build step, no dependencies.

```bash
# any static server works, e.g.:
npx serve .
# or
python3 -m http.server 8000
```
Then open the printed URL. (Opening `index.html` straight from disk works too, since scripts load via plain `<script>` tags.)

### Tune / test the engine
```bash
node scripts/test-engine.js
```
Prints season projections for sample squads, gate-flag behaviour, head-to-head matches, and dataset coverage.

---

## Deploy to Vercel

This repo is ready to deploy as-is (static, `vercel.json` included).

**Option A — GitHub import (easiest):**
1. Go to [vercel.com/new](https://vercel.com/new) and **Import** this GitHub repository.
2. Framework Preset: **Other**. Build Command: *(leave empty)*. Output Directory: **`./`** (root).
3. Click **Deploy**. Every push to the branch auto-deploys.

**Option B — Vercel CLI:**
```bash
npm i -g vercel
vercel          # preview deploy (follow the prompts)
vercel --prod   # production deploy
```

---

## Project structure
```
index.html          # app shell + screens
css/styles.css      # all styling (dark pitch theme, responsive)
js/data.js          # 1000+ players across 17 clubs, full 1990–2026 timeline
js/engine.js        # category sums, gating, season sim, head-to-head match
js/cpu.js           # CPU drafting AI (easy / normal / hard)
js/game.js          # slot machine + draft state machine + results
js/ui.js            # rendering & interaction
scripts/test-engine.js  # node dev harness
vercel.json         # static deploy config
```
