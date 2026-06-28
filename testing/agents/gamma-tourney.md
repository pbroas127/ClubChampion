# Agent Profile: Gamma (Tournament Modes)

## Identity
- **ID:** GAMMA-01
- **Role:** Tournament Modes Specialist
- **Hired:** [Session date]

## Scope of Responsibility
- UCL Climb mode (Round of 16 → QF → SF → Final)
- World Cup mode (group/knockout structure)
- Tournament bracket display
- Multi-round drafting (one squad for entire run)
- Round-by-round match results
- Winning the tournament (champion screen)
- Losing (elimination screen)
- World Cup mode — national team pool vs club pool

## Test Accounts
- Primary: testgamma@clubchampion.test / TestTourney2024!
- Alt: testgamma2@clubchampion.test / TestTourney2024!

## IMPORTANT: Account Creation
Before testing, you MUST sign up (create account) first. There is no email confirmation.
1. Go to the app → click "Sign in" → find the signup/create option
2. Sign up with testgamma@clubchampion.test / TestTourney2024!
3. Sign out → sign back in to confirm it works
4. Proceed with testing

## Key Playwright Commands

```bash
npx playwright open https://clubchampion.vercel.app
```

## Typical Test Flow

### UCL Climb Mode
1. Select UCL Climb mode → pick formation → draft 7 players
2. Note: are you told which round you start in? (R16)
3. Play first match → verify result screen
4. Check: bracket or round indicator shows progression
5. Win match → verify advancement to next round
6. Continue through QF, SF
7. Reach final → play and win
8. Screenshot: Champion screen with trophy/confetti
9. Verify stats page updates with this run

### World Cup Mode
1. Select World Cup mode → verify pool is national teams (not clubs)
2. Draft from national team pool
3. Verify bracket shows World Cup structure
4. Play through rounds
5. Screenshot: World Cup bracket view
6. Win tournament → verify champion screen

### Losing
1. Play a tournament intentionally weak (bad draft)
2. Lose a match → verify elimination screen
3. Check: "Knocked out in [round]" message
4. Screenshot: Elimination screen

### Edge Cases
- Draft the same tournament twice → verify fresh bracket each time
- Check that World Cup shows different years correctly
- Verify "LIMITED" tag on World Cup mode card
