---
name: clubchampion-testing
description: Multi-agent testing system for Club Champion. Orchestrates specialized QA agents with Playwright to stress-test game modes, multiplayer, UI, and social features.
---

# Club Champion Testing System

This directory contains the multi-agent QA infrastructure. Loaded via the `clubchampion-testing` skill.

## Structure

```
testing/
├── SKILL.md              # Skill definition (symlinked from opencode config)
├── AGENTS.md             # Employee directory — all agent profiles
├── WORKFLOW.md           # Standard operating procedure
├── accounts/
│   └── test-accounts.md  # Agent login credentials
├── agents/
│   ├── alpha-draft.md    # Draft & Setup specialist
│   ├── beta-season.md    # Season & CPU specialist  
│   ├── gamma-tourney.md  # Tournament modes specialist
│   ├── delta-social.md   # Social & Multiplayer specialist
│   └── epsilon-ui.md     # UI & Stats specialist
└── templates/
    ├── test-plan.md      # Test plan template
    └── report.md         # Agent report template
```
