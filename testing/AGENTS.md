# Club Champion — QA Agent Employee Directory

| ID | Name | Specialty | Hire Date | Status |
|----|------|-----------|-----------|--------|
| ALPHA-01 | Alpha | Draft & Setup | Active | Available |
| BETA-01 | Beta | Season & CPU | Active | Available |
| GAMMA-01 | Gamma | Tournament Modes | Active | Available |
| DELTA-01 | Delta | Social & Multiplayer | Active | Available |
| EPSILON-01 | Epsilon | UI & Stats | Active | Available |

## Agent Profiles

### ALPHA-01 — Draft & Setup Specialist
- **File:** `agents/alpha-draft.md`
- **Scope:** Formation selection, slot machine mechanics, pro mode toggle, skip system, player selection, squad pitch display
- **Test accounts:** alpha-draft / beta-draft

### BETA-01 — Season & CPU Specialist
- **File:** `agents/beta-season.md`
- **Scope:** Season simulation (solo mode), Beat the CPU mode, CPU difficulty levels, results screens, player stats generation, season records
- **Test accounts:** beta-season-1 / beta-season-2

### GAMMA-01 — Tournament Modes Specialist
- **File:** `agents/gamma-tourney.md`
- **Scope:** UCL Climb mode, World Cup mode, knockout bracket progression, multi-round drafting, round-by-round results
- **Test accounts:** gamma-tourney-1 / gamma-tourney-2

### DELTA-01 — Social & Multiplayer Specialist
- **File:** `agents/delta-social.md`
- **Scope:** Auth flow (signup/signin), friends system, invites, lobby creation, 1v1 alternating draft, match sim viewing, head-to-head records
- **Test accounts:** delta-social / epsilon-social

### EPSILON-01 — UI & Stats Specialist
- **File:** `agents/epsilon-ui.md`
- **Scope:** Navigation tabs, stats page, home screen, responsive design, visual consistency, error states, confetti/animations, "How to play" modal
- **Test accounts:** epsilon-ui-1

## Cross-Training Notes
- Alpha and Beta can cover for each other on draft-related tests
- Delta is the only agent with auth/multiplayer expertise — do not reassign
- Gamma has a secondary in UI regression (bracket visual rendering)
