# Agent Profile: Epsilon (UI & Stats)

## Identity
- **ID:** EPSILON-01
- **Role:** UI & Stats Specialist
- **Hired:** [Session date]

## Scope of Responsibility
- Navigation tabs (Play, Stats, Friends, Ranked)
- Home screen layout (brand, mode grid, kick-off button)
- Stats page (best seasons, player records, mode filters)
- "How to play" modal
- Ranked tab (coming soon placeholder)
- Visual consistency (fonts, colors, spacing, pitch design)
- Responsive design (mobile, tablet, desktop)
- Animations (confetti on win, slot reel spin)
- Error states and empty states
- Overall polish and visual bugs

## Test Accounts
- Primary: testepsilonui@clubchampion.test / TestUI2024!

## IMPORTANT: Account Creation
Before testing, you MUST sign up (create account) first. There is no email confirmation.
1. Go to the app → click "Sign in" → find the signup/create option
2. Sign up with testepsilonui@clubchampion.test / TestUI2024!
3. Sign out → sign back in to confirm it works
4. Proceed with testing

## Key Playwright Commands

```bash
# Desktop viewport
npx playwright open https://clubchampion.vercel.app

# Mobile viewport
npx playwright open --viewport-size=375,667 https://clubchampion.vercel.app

# Screenshots
npx playwright screenshot https://clubchampion.vercel.app --viewport-size=1280,720 desktop-home.png
npx playwright screenshot https://clubchampion.vercel.app --viewport-size=375,667 mobile-home.png
npx playwright screenshot https://clubchampion.vercel.app --viewport-size=768,1024 tablet-home.png
```

## Typical Test Flow

### Navigation & Home
1. Open app → verify brand logo, title, tagline visible
2. Verify all 5 mode cards render (Season, Beat CPU, UCL, WC, Ranked)
3. Click each mode card → verify selection highlight
4. Verify "KICK OFF" button is enabled when a mode is selected
5. Click CPU mode → verify difficulty selector appears
6. Navigate tabs: Play → Stats → Friends → Ranked
7. Screenshot: Each tab view

### How to Play Modal
1. Click "How to play" link → verify modal opens
2. Verify all 6 steps listed
3. Click close → verify modal dismisses
4. Screenshot: Modal open

### Stats Page
1. Play a season first (to generate stats)
2. Navigate to Stats tab → verify stats display
3. Check: mode filter buttons work
4. Screenshot: Stats page with data

### Responsive Testing
1. Desktop (1280x720): verify layout looks natural
2. Tablet (768x1024): verify mode grid adjusts
3. Mobile (375x667): verify single-column layout, tap targets
4. Screenshot: Each viewport

### Visual Polish
- Verify fonts load (Archivo, Inter)
- Verify pitch gradient renders smoothly
- Verify colors match dark football theme
- Check for text overflow in mode cards
- Check button hover states
- Verify no horizontal scroll on any viewport

### Edge Cases
- Long player names in draft screen
- Stats page with zero games played
- Rapid tab switching
- Browser back/forward navigation
- Page refresh mid-draft
