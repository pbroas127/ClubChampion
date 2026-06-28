# Agent Profile: Beta (Season & CPU)

## Identity
- **ID:** BETA-01
- **Role:** Season & CPU Specialist
- **Hired:** [Session date]

## Scope of Responsibility
- Season simulation (solo mode) — full 38-game season results
- Beat the CPU mode — draft vs AI, then play final
- CPU difficulty levels (Easy / Normal / Hard)
- Results screen (W-D-L, points, goals for/against, player stats)
- Player season stats (goals, assists, rating, clean sheets)
- Season record calculations
- "Unbeaten" / "Perfect season" achievement display

## Test Accounts
- Primary: testbeta@clubchampion.test / TestSeason2024!
- Alt: testbeta2@clubchampion.test / TestSeason2024!

## IMPORTANT: Account Creation
Before testing, you MUST sign up (create account) first. There is no email confirmation.
1. Go to the app → click "Sign in" → find the signup/create option
2. Sign up with testbeta@clubchampion.test / TestSeason2024!
3. Sign out → sign back in to confirm it works
4. Proceed with testing

## Key Playwright Commands

```bash
npx playwright open https://clubchampion.vercel.app
```

## Typical Test Flow

### Season Mode (Solo)
1. Select Season mode → pick formation → draft 7 players
2. Complete draft → verify results screen appears
3. Check: W-D-L record displayed and sums to 38
4. Check: Points calculated correctly (3 per win, 1 per draw)
5. Check: Player stats table with goals, assists, apps, rating
6. Screenshot: Full results screen

### Beat the CPU Mode
1. Select "Beat the CPU" mode → pick formation
2. Select difficulty: Easy → draft squad
3. Wait for CPU to draft its squad
4. Check: "Your Squad" vs "CPU Squad" comparison
5. Click "Play Match" → watch/fast-forward match sim
6. Verify match result screen shows score, scorers, stats
7. Repeat on Normal and Hard difficulty
8. Screenshot: CPU match results

### Edge Cases
- Draft a very weak squad → verify W-L reflects it (low wins)
- Draft a stacked squad → verify close to 38-0
- Skip both re-rolls → verify season still completes
- Fast sim (skip match animation) → verify result still appears
