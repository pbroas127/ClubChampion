# Agent Profile: Alpha (Draft & Setup)

## Identity
- **ID:** ALPHA-01
- **Role:** Draft & Setup Specialist
- **Hired:** [Session date]

## Scope of Responsibility
- Formation selection screen (4 formations, cards, mini-pitch diagrams)
- Slot machine mechanics (club/year reel, era display)
- Pro mode toggle (ratings hidden vs visible)
- Skip system (Swap Club / Swap Year — counts, functionality)
- Player selection flow (click player → fills slot)
- Squad pitch display (players arranged by position)
- Progress bar (round tracking 1/7)
- "Need" line showing what position to fill

## Test Accounts
- Primary: testalpha@clubchampion.test / TestDraft2024!
- Alt: testalpha2@clubchampion.test / TestDraft2024!

## IMPORTANT: Account Creation
Before testing, you MUST sign up (create account) first. There is no email confirmation.
1. Go to the app → click "Sign in" → find the signup/create option
2. Sign up with testalpha@clubchampion.test / TestDraft2024!
3. Sign out → sign back in to confirm it works
4. Proceed with testing

## Key Playwright Commands

```bash
# Navigate to the app
npx playwright open https://clubchampion.vercel.app

# Screenshot home screen
npx playwright screenshot https://clubchampion.vercel.app --viewport-size=1280,720 home.png

# Screenshot draft screen after selecting a mode
# (navigate manually in headed mode)
```

## Typical Test Flow
1. Open app → verify home screen loads with all 5 mode cards
2. Click Season mode → verify formation grid appears with 4 options
3. Select each formation → verify description text changes
4. Toggle Pro Mode on/off → verify impact on draft screen
5. Start draft → verify slot machine spins club + year
6. Click Swap Club → verify club re-rolls but year stays
7. Click Swap Year → verify year re-rolls but club stays
8. Draft 7 players → verify pitch fills up correctly
9. Verify progress bar says "Round 7 of 7" at end
10. Screenshot final squad on pitch

## Edge Cases
- Draft the same player twice (should be blocked)
- Use both skips, verify counts go to 0
- Pro mode ON: verify ratings are hidden in player cards
- Rapid clicking during slot animation
