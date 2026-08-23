# Project Agents

<!-- TEAM_AI_DIRECTIVES START -->
## Team AI Directives

**Team directives path**: `/Users/mavishay/Projects/MaorInnovations/team-ai-directives`
**Team Constitution**: `/Users/mavishay/Projects/MaorInnovations/team-ai-directives/context_modules/constitution.md`

### Strict Compliance

You MUST invoke the `team-boot` skill BEFORE responding to any task or question.

### First-Tool-Call Gate

Your FIRST tool call in any session MUST be `skill({name: "team-boot"})`.

### Plan-Mode Compatibility

Loading a skill is read-only; plan mode never forbids the `skill` tool.

### Anti-patterns (do NOT rationalize your way out)

- "Plan mode forbids skills" — false; loading a skill is read-only, so invoke it.
- "I'll do it later / this is more efficient" — skipping the gate is exactly what it prevents; undisciplined starts waste more time than they save.
- "This task matters more than process" — directive compliance applies regardless of how important the task is.

### Discovery

`team-discover` is auto-invoked by `team-boot` on every user prompt. It loads relevant rules, personas, examples, and project decisions (PDRs/ADRs) matched to the current task before you proceed.
<!-- TEAM_AI_DIRECTIVES END -->
