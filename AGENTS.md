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

### GitHub Account Verification

Before performing ANY GitHub CLI action (creating issues, PRs, comments, or any `gh` command), you MUST verify the active GitHub user is `mavishay`:

```bash
gh api user --jq '.login'
```

If the output is not `mavishay`, run:
```bash
gh auth switch --user mavishay
```

This prevents creating issues/PRs under the wrong account. Never skip this check.

### Writing GitHub Issues

When creating issues for this project, follow this format exactly:

#### Body Structure

Every issue body MUST contain these sections in order:

1. **Summary** — 1-2 sentence description
2. **PRD Reference** — map to PRD sections, user stories, requirements (REQ-NNN), and PDRs
3. **Current State** — what exists today in the codebase with specific `file:line` references
4. **Implementation Requirements** — numbered subsections with:
   - File paths to create/modify
   - Code snippets (TypeScript interfaces, SQL migrations, IPC handlers)
   - Exact method signatures and API contracts
5. **Acceptance Criteria** — checkbox list (`- [ ]`)
6. **Dependencies** — which issues block this one, which this one blocks, related issues
7. **Labels** — `enhancement`, `blocked-by: #N`, `wave: N-name`

#### Codebase References

Always include `file:line` references from the actual codebase. Explore the codebase first to find:
- Existing implementations to build on
- Patterns to follow (IPC handlers, preload APIs, component structure)
- Database tables and migration numbering (currently at schema version 11)

#### Labeling Convention

- **`enhancement`** — all feature issues
- **`blocked-by: #N`** — each dependency gets its own label
- **`wave: N-name`** — execution wave: `1-foundation`, `2-parallel`, `3-dependent`, `4-improvements`, `5-notifications`, `5-infrastructure`, `6-polish`

#### GitHub Relationships

After creating issues, add **blocked-by relationships** via GraphQL (not just labels):

```bash
gh api graphql -f query="mutation { addBlockedBy(input: {issueId: \"<subject_node_id>\", blockingIssueId: \"<blocking_node_id>\"}) { clientMutationId } }"
```

To get node IDs:
```bash
gh api graphql -f query='{ repository(owner: "mavishay", name: "mydashboard") { issues(first: 50) { nodes { number id } } } }'
```

#### Project Board

Add every issue to the project board:
```bash
gh project item-add 1 --owner mavishay --url "https://github.com/mavishay/mydashboard/issues/<number>"
```

#### Checklist for New Issues

1. `gh api user --jq '.login'` → verify `mavishay`
2. Explore codebase for `file:line` references
3. Write body to `/tmp/issue-<name>.md` (avoid shell escaping issues)
4. `gh issue create --repo mavishay/mydashboard --title "..." --label "enhancement" --body-file /tmp/issue-<name>.md`
5. `gh project item-add 1 --owner mavishay --url ...`
6. `gh issue edit <N> --repo mavishay/mydashboard --add-label "blocked-by: #X,wave: N-name"`
7. Add GraphQL blocked-by relationships
8. Clean up temp files

### Issue Numbering

Issues are numbered sequentially. Current max: #38. Next issue should be #39.

### Existing Issues Reference

| # | Title | Status | Wave |
|---|-------|--------|------|
| 5 | Native notification system | OPEN | 3-dependent |
| 12 | Setup optimization (under 15 min) | OPEN | 3-dependent |
| 13 | Onboarding consent flow | OPEN | 3-dependent |
| 27 | Automated email fetch & classify cron job | OPEN | 4-improvements |
| 28 | Unread-only fetch + delete read after 3 days | OPEN | 4-improvements |
| 29 | Calendar view above tasks | OPEN | 4-improvements |
| 30 | System notifications 3x/day | OPEN | 5-notifications |
| 31 | Allow tasks edit/add/delete | OPEN | 4-improvements |
| 32 | Account tags/labels with color settings | OPEN | 4-improvements |
| 33 | Mark email as read (syncs to inbox) | OPEN | 4-improvements |
| 34 | Email ordering and grouping options | OPEN | 4-improvements |
| 35 | UI/UX improvements | OPEN | 6-polish |
| 36 | Replace n8n sidecar with in-app cron | OPEN | 5-infrastructure |
| 37 | Email preview modal with browser link | OPEN | 4-improvements |
| 38 | Custom classification rules for AI agent | OPEN | 4-improvements |

### Wave Execution Order

1. **Wave 3-dependent** (#5, #12, #13) — finish existing open items
2. **Wave 4-improvements** (#27, #28, #29, #31, #32, #33, #34, #37, #38) — new features, parallelizable
3. **Wave 5** (#30 notifications, #36 infra) — depends on wave 4
4. **Wave 6-polish** (#35) — UI polish, last
<!-- TEAM_AI_DIRECTIVES END -->
