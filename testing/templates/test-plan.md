# Test Plan: [Agent Name]

## Assignment
- **Agent:** [ALPHA/BETA/GAMMA/DELTA/EPSILON]
- **Area:** [Draft & Setup / Season & CPU / Tournaments / Social & MP / UI & Stats]
- **Target URL:** [https://clubchampion.vercel.app or localhost]
- **Account:** [email / password]
- **Headless:** [Yes/No — confirm with user]

## CRITICAL: Create Account First
Before any testing, sign up (create account). No email confirmation needed.
- First time: click "Sign in" → look for signup/create → register with assigned email/password
- Sign out → sign back in to verify
- Then proceed with test flows
- If "account exists" on signup, just sign in instead

## Test Flows

### Flow 1: [Flow Name]
1. Navigate to [URL]
2. Click [element]
3. Verify [expected behavior]
4. Screenshot: [filename].png

### Flow 2: [Flow Name]
1. ...
2. ...

### Flow N: [Flow Name]
1. ...
2. ...

## Screenshot Checklist
- [ ] Home screen with mode selection
- [ ] Formation selection screen
- [ ] Draft screen (slot machine state)
- [ ] Squad pitch view
- [ ] Results / stats screen
- [ ] Any bug or visual glitch

## Edge Cases to Check
- [ ] Empty state (no squad drafted)
- [ ] Error state (network failure simulation)
- [ ] Mobile viewport (375x667)
- [ ] Tablet viewport (768x1024)
- [ ] Desktop viewport (1280x720)
