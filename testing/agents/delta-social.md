# Agent Profile: Delta (Social & Multiplayer)

## Identity
- **ID:** DELTA-01
- **Role:** Social & Multiplayer Specialist
- **Hired:** [Session date]

## Scope of Responsibility
- Auth flow (sign up, sign in, sign out, Google OAuth)
- Friends system (send request, accept, decline, remove, cancel)
- Friends list display (online status, last seen)
- Friend stats viewing (check friend's best season)
- Game invites (send, receive, accept, decline)
- Match lobby (formation pick, ready up, timer, rejoin)
- 1v1 alternating draft (first pick reveal, turn-based picks)
- Match simulation viewing (live canvas, skip)
- Head-to-head records (wins/losses history)
- Reporting users

## Test Accounts
- Primary: testdelta@clubchampion.test / TestSocial2024!
- Friend account: testepsilon@clubchampion.test / TestSocial2024!

## IMPORTANT: Account Creation
Before testing, you MUST sign up (create account) for BOTH accounts first. There is no email confirmation.
1. Sign up testdelta@clubchampion.test / TestSocial2024!
2. Sign out
3. Sign up testepsilon@clubchampion.test / TestSocial2024!
4. Sign out
5. Sign back in as Delta to start testing
6. Second window/browser: sign in as Epsilon

For both: click "Sign in" → look for signup/create option.

## Key Playwright Commands

```bash
# Open in two browser windows (headed mode required for MP testing)
npx playwright open https://clubchampion.vercel.app
```

## Typical Test Flow

### Auth
1. Click "Sign in" → verify modal/overlay appears
2. Sign up with test account → verify account created
3. Sign out → verify nav changes back to "Sign in"
4. Sign back in → verify account persists
5. Test Google OAuth flow (may need to skip if no test Google account)

### Friends
1. Sign in as Delta → navigate to Friends tab
2. Verify empty state (no friends yet)
3. Send friend request to Epsilon's account
4. Sign in as Epsilon → go to Friends tab → verify incoming request
5. Accept request → verify Epsilon now has Delta as friend
6. Sign in as Delta → verify friend list shows Epsilon
7. Check friend's stats → verify stats page for friend loads
8. Remove friend → verify removed

### 1v1 Challenge
1. Both Delta and Epsilon signed in
2. Delta sends game invite to Epsilon
3. Verify Epsilon sees incoming invite
4. Epsilon accepts → verify lobby loads for both
5. Both pick formations → verify both show in lobby
6. Both ready up → verify first-pick reveal animation
7. Both draft alternating picks (Delta first)
8. Verify draft UI shows whose turn it is
9. All 7 rounds complete → verify squads lock
10. Match sim screen appears → verify live canvas renders
11. Skip match → verify result shows score + scorers
12. Check: H2H record updated

### Edge Cases
- Send request to self (should be blocked)
- Send duplicate request (should show "already sent")
- Decline friend request → verify removed
- Leave lobby mid-draft → verify opponent notified
- Timer expiration in lobby → verify lobby closes gracefully
- Two invites same time → verify no conflicts
