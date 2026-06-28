# Club Champion — Testing Workflow (SOP)

## Phase 1: Receive Request

User requests testing on a feature, mode, or the full app.

## Phase 2: Scope Analysis

The QA lead reads the relevant code/files and determines:

1. What areas need testing (e.g., draft, season sim, multiplayer lobby, stats)
2. How many agents are needed (no overlap between agents)
3. Which existing agents fit (check AGENTS.md — reuse before creating new)
4. If a new agent is needed, create a profile in `agents/` and add to AGENTS.md

### Standard Agent Assignments (full app test)

| Area | Agent | Key Files to Test |
|------|-------|-------------------|
| Draft & Setup | Alpha | `screen-setup`, `screen-draft`, formations, slot machine, pro mode, skips |
| Season & CPU | Beta | `screen-results`, season sim, CPU draft, match result, player stats |
| Tournament Modes | Gamma | UCL climb, World Cup mode, bracket display, round progression |
| Social & Multiplayer | Delta | Auth, friends, invites, lobby, 1v1 draft, match sim, H2H records |
| UI & Stats | Epsilon | Navigation, stats page, home screen, responsive, modals, animations |

## Phase 3: Assignment

For each agent, define a clear **test plan** using the template at `templates/test-plan.md`.

Each test plan must specify:
- **Target URL** (staging or production)
- **Test account credentials**
- **Specific flows to test** (numbered steps)
- **What screenshots to take**
- **Playwright commands to run**

## PHASE 3A: Account Creation (MANDATORY — EVERY AGENT)

Before ANY testing begins, every agent MUST:

1. Navigate to the app URL
2. Click "Sign in" → locate the signup/create account option
3. Sign up with their assigned email + password
4. Verify the account was created (no email confirmation = instant)
5. Sign out
6. Sign back in to confirm credentials work
7. Only THEN proceed with test flows

If an agent controls multiple accounts (e.g., Delta needs two for multiplayer), they must create BOTH accounts before testing begins. Attempting to "sign in" before creating an account will fail.

**This rule applies to ALL agents, ALL test runs, forever.**

## Phase 4: Execution

1. Ask the user: **"Headed or headless?"** (visible browser vs silent)
2. Launch agents — each gets their own Task agent with their test plan
3. Agents run Playwright CLI commands:
   - `npx playwright open <url>` — headed exploration
   - `npx playwright screenshot <url> --viewport-size=1280,720` — screenshots
   - Custom scripts as needed
4. Agents document everything in their report using `templates/report.md`
5. Agents take screenshots and save them

## Phase 5: Check-In

Each agent checks in when done with:
- "Agent [NAME] complete. Report filed at `testing/reports/[name]-report.md`"
- Progress is tracked in a todo list visible to the user

## Phase 6: Debrief

When ALL agents have checked in:

1. All agents load each other's reports
2. They discuss via structured deliberation:
   - **Bugs found** — severity, reproduction steps
   - **Great parts** — what worked well, looked good
   - **Questions** — design decisions they want answered
   - **Concerns** — potential issues for the future
   - **Proposals** — specific changes to recommend
3. They compile a final report with screenshots

## Phase 7: Presentation

The final consolidated report is presented to the user with:
- Executive summary
- Bug list (prioritized)
- Screenshot gallery
- Improvement proposals
- Questions for the user
