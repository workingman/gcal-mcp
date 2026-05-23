# Rule: Generating GitHub Issues from a PRD

## Goal

To guide an AI assistant in decomposing a Product Requirements Document (PRD) into GitHub Issues using the `gh` CLI. Each issue should be self-contained and detailed enough for a junior developer or AI coding agent to implement without re-reading the entire PRD.

## Prerequisites

- The `gh` CLI is authenticated (`gh auth status` succeeds)
- The working directory is a git repository linked to a GitHub remote
- Required labels exist in the repository (see Label Setup below)
- A completed PRD following the structure from `process/create-prd.md`
- A completed TDD following the structure from `process/create-tdd.md`

## Context Management

Issue generation is the most context-intensive step in the process. Without
explicit guardrails, quality degrades as cumulative output grows — sub-issues
get assigned to the wrong parents, components get skipped entirely, and
acceptance criteria become vague. The following rules are **hard constraints**,
not suggestions.

### Rule 1: One parent per invocation

Each parent issue's sub-issues MUST be generated in a **separate agent
invocation** (subagent, session, or conversation). Never generate sub-issues
for multiple parents in a single context window.

Why: The PRD + TDD already consume significant context. Adding the output of
one parent's sub-issues leaves less room for the next parent's reasoning.
Quality degrades predictably after ~12 cumulative sub-issues in a single
context.

### Rule 2: Maximum 5 sub-issues per execution invocation

A single **execution** invocation MUST NOT **create** more than **5 sub-issues**.
This is a context-management cap for the creation step, not a scoping limit.
The right number of sub-issues for a parent is determined in the planning phase
(see Process § Phase 2a) based purely on right-sizing — if a parent needs 3
right-sized issues, plan 3; if it needs 15, plan 15. The execution phase
handles batching:

1. The first execution invocation creates the first batch (up to 5) and ends.
2. A second execution invocation is spawned for the next batch, receiving the
   already-created issue numbers to avoid duplication.
3. Repeat until all planned sub-issues are created.

Why: Each sub-issue is ~600-800 tokens of generated output. Beyond 5, the
agent's working memory for cross-referencing against PRD/TDD requirements
degrades, leading to missed components and vague acceptance criteria.

### Rule 3: Scope fencing

Each invocation receives an explicit scope assignment: one parent issue and its
relevant PRD functional requirements and TDD sections. The agent MUST:

- **Only create sub-issues for its assigned parent.** If a requirement belongs
  to a different parent, note it as a cross-parent dependency in the sub-issue
  body — do not create a sub-issue for it.
- **Not assume knowledge of other parents' sub-issues.** Each invocation is
  self-contained.

### Rule 4: Self-validation before finishing

Before ending, each invocation MUST run this checklist and report the results:

1. **Parent AC coverage:** Every acceptance criterion on the parent issue maps
   to at least one sub-issue.
2. **PRD FR coverage:** Every PRD functional requirement in scope has at least
   one sub-issue addressing it, including all acceptance criteria.
3. **TDD component coverage:** Every TDD component, interface, and data model
   in scope maps to at least one sub-issue.
4. **TDD resolved decisions:** Every resolved Open Question in the TDD that
   affects this parent's scope is reflected in a sub-issue's acceptance
   criteria.
5. **No orphaned scope:** No sub-issue covers work that belongs to a different
   parent.
6. **Uniqueness:** No two sub-issues cover the same work.

If any check fails, the agent must fix the gap (create a missing sub-issue,
move a misscoped one, add missing acceptance criteria) before finishing — as
long as doing so stays within the 5-sub-issue cap for the current invocation.
If the cap would be exceeded, report the gap for the next invocation to handle.

### Planning invocation template

When spawning a **planning** subagent for a parent issue (Phase 2a), provide
this context:

```
AGENT_META: {"type": "issue-planning", "parent": <number>}

You are PLANNING (not creating) sub-issues for ONE parent issue.

PARENT ISSUE: #<number> — <title>
SCOPE: <list of PRD FR-xxx numbers and TDD sections assigned to this parent>

INPUTS (read these files):
- PRD: <path>
- TDD: <path>
- Parent issue: gh issue view <number>

OUTPUT: A numbered list of right-sized sub-issues. For each:
  - Title (imperative sentence)
  - One-line summary of what it accomplishes
  - Domain tag (e.g., backend/rust, frontend/ts)
  - Estimated complexity (low/medium/high)

RIGHT-SIZING CRITERIA (see process/create-issues.md § Right-Sizing):
- One agent context window per issue
- Conceptual coherence — one responsibility per issue
- 2-5 implementation checkpoints of roughly even weight
- Testable in isolation with 2-8 tests
- There is NO cap on the number of sub-issues. Plan as many as the scope
  requires to keep each one right-sized. 3 is fine. 12 is fine. The execution
  phase handles batching.

CONSTRAINTS:
- Do NOT create any GitHub issues. Output is a plan only.
- Only plan sub-issues for THIS parent. Cross-parent needs are noted as
  dependencies.
- Run coverage checks: every parent AC, every in-scope PRD FR, and every
  in-scope TDD component must map to at least one planned sub-issue.
```

### Execution invocation template

When spawning an **execution** subagent for a parent issue (Phase 2b), provide
this context:

```
AGENT_META: {"type": "issue-creation", "parent": <number>, "batch": <n>}

You are creating sub-issues for ONE parent issue from a pre-approved plan.

PARENT ISSUE: #<number> — <title>
SCOPE: <list of PRD FR-xxx numbers and TDD sections assigned to this parent>

PLANNED SUB-ISSUES (create these):
<paste the numbered list from the planning phase — this batch only>

INPUTS (read these files):
- PRD: <path>
- TDD: <path>
- Parent issue: gh issue view <number>
- Already-created sub-issues (if any): #<n1>, #<n2>, ...

CONSTRAINTS:
- Maximum 5 sub-issues in this invocation.
- Create ONLY the sub-issues listed in PLANNED SUB-ISSUES above.
- Only create sub-issues for THIS parent. Cross-parent needs are noted as
  dependencies, not new sub-issues.
- Run the self-validation checklist before finishing.
- Follow the sub-issue body template from process/create-issues.md.

BASH PERMISSION PATTERN:
- Single commands (gh issue create, gh api, etc.) can run directly.
- For multi-line scripts (e.g., create issue + capture ID + link sub-issue),
  write the script to `.tmp/agent-<taskname>.sh` and run it with
  `bash run.sh .tmp/agent-<taskname>.sh`. This is pre-authorized and avoids
  permission prompts. Do NOT use /tmp/ — only `.tmp/` in the project root.
```

## Right-Sizing

The real constraint for agent work is **context window**, not clock time. An
agent that touches 12 files across 3 domains will degrade regardless of how
"simple" each change is. Three complementary layers address this:

1. **Right-sizing** — get most issues completable in one context window
   (optimistic planning).
2. **Checkpoints** — graceful degradation when we're off by a bit. The agent
   commits at a checkpoint and stops; a fresh session picks up from the last
   commit.
3. **Observability** — spot when we're off by a lot, so we can improve sizing
   heuristics over time (see `process/agent-observability.md`).

### Heuristics

Use these when planning sub-issues:

- **Conceptual coherence** — each issue has one responsibility. If you need
  "and" to describe it, consider splitting.
- **Bounded file surface** — if the agent needs to read or modify a large
  number of files, the issue is probably too broad. A growing file list is a
  signal to split, not a hard cap.
- **Clear interfaces** — inputs and outputs are defined so the agent stays on
  rails. If the issue depends on undefined interfaces from other issues, it's
  not self-contained enough.
- **2-5 checkpoints of roughly even weight** — no single checkpoint should
  represent more than ~40% of the work. If one checkpoint dwarfs the others,
  the issue scope is unbalanced.
- **Testable in isolation** — 2-8 tests without needing the full system running.
  If testing requires extensive integration setup, the issue may be scoped at
  the wrong level.
- **Do NOT pad or cap** — create only as many sub-issues as the scope
  requires. 3 is fine. 12 is fine. The planning phase determines the right
  count; the execution phase handles batching (max 5 per subagent, additional
  subagents spawned as needed).

## Label Setup

Before first use, ensure these labels exist in the repository. Create any that are missing:

```bash
# Type labels
gh label create "type:feature" --color "0E8A16" --description "New functionality" --force
gh label create "type:test" --color "FBCA04" --description "Test coverage" --force
gh label create "type:refactor" --color "D4C5F9" --description "Code improvement" --force
gh label create "type:docs" --color "0075CA" --description "Documentation" --force
gh label create "type:bug" --color "D73A4A" --description "Bug fix" --force

# Complexity labels
gh label create "complexity:low" --color "C2E0C6" --description "Straightforward, minimal risk" --force
gh label create "complexity:medium" --color "FEF2C0" --description "Some judgment required" --force
gh label create "complexity:high" --color "F9D0C4" --description "Significant complexity or risk" --force

# Phase labels
gh label create "phase:data" --color "BFD4F2" --description "Data layer: schemas, models, migrations" --force
gh label create "phase:service" --color "D4C5F9" --description "Service layer: business logic, API handlers" --force
gh label create "phase:integration" --color "FEF2C0" --description "Integration: connecting services, middleware" --force
gh label create "phase:presentation" --color "BFDADC" --description "Presentation: UI components, views" --force
gh label create "phase:polish" --color "E6E6E6" --description "Polish: error handling, edge cases, docs" --force
```

## Process

1.  **Receive PRD and TDD References:** The user points the AI to a specific PRD file and its corresponding TDD file.

2.  **Analyze PRD:** Read and analyze the functional requirements, acceptance criteria, implementation phases, and dependencies from the PRD.

3.  **Analyze TDD:** Read and analyze the technology choices, architecture overview, data models, interface contracts, directory structure, and key implementation decisions from the TDD. The TDD is the primary source for:
    - **File paths:** Which files to create or modify (from the directory structure)
    - **Interface contracts:** The exact function signatures and data types to implement
    - **Implementation guidance:** Patterns to follow, pitfalls to avoid, architectural constraints
    - **Data models:** Schemas, types, and validation rules
    - **Risk mitigations:** Technical risks and their required mitigations (from the risk register)

4.  **Assess Current State:** Review the existing codebase to understand architectural patterns, conventions, and relevant existing components. Identify files, modules, and utilities that can be leveraged or need modification.

5.  **Phase 1 -- Generate Parent Issues (draft only):** Based on the PRD analysis, TDD analysis, and codebase assessment, draft the parent issues. Each parent issue maps to an implementation phase or major functional area from the PRD.

    Present the parent issues to the user in this format:

    ```
    Parent Issues to create:
    1. [Title] -- [one-line summary] (phase:xxx, complexity:xxx)
    2. [Title] -- [one-line summary] (phase:xxx, complexity:xxx)
    ...
    ```

    Inform the user: "I have drafted the parent issues based on the PRD. Ready to generate the sub-issues and create everything in GitHub? Respond with 'Go' to proceed."

6.  **Wait for Confirmation:** Pause and wait for the user to confirm.

7.  **Phase 2a -- Plan Sub-Issues:** Once confirmed:

    a. Create all parent issues first using `gh issue create`. Record their
       issue numbers.
    b. For each parent issue, spawn a **lightweight planning subagent** to
       determine the right number of sub-issues. The planning agent reads the
       PRD, TDD, and parent issue, then outputs a numbered list of right-sized
       sub-issues (title + summary + domain + complexity). No cap on count —
       the plan reflects what the scope actually requires. Use the **planning
       invocation template** from Context Management.
    c. The orchestrator reviews the plans. (Optional: present the combined
       plan to the user for a final check before creation.)

8.  **Phase 2b -- Create Sub-Issues in GitHub:** For each parent's plan:

    a. If the plan has 5 or fewer sub-issues, spawn a single **execution
       subagent** to create them all. Use the **execution invocation template**
       from Context Management.
    b. If the plan has more than 5 sub-issues, chunk into batches of 5 and
       spawn one execution subagent per batch. The second batch receives
       already-created issue numbers to avoid duplication.
    c. Each execution subagent creates its sub-issues via `gh issue create`
       and links them to the parent using the `gh api` sub-issues endpoint.
    d. If the PRD specifies ordering constraints, set dependencies between
       issues using the `gh api` dependencies endpoint.

9.  **Summary:** After all issues are created, present a summary table showing issue numbers, titles, parent-child relationships, and URLs.

## Issue Structure

### Parent Issue

Parent issues represent a major phase or functional area. They are tracking containers whose progress is measured by sub-issue completion.

**Title format:** `[Feature Name]: [Phase/Area Description]`

**Body template:**

```markdown
## Overview

[2-3 sentences: what this phase accomplishes and why it matters. Reference the PRD and TDD file paths.]

**PRD:** `docs/prd-feature-name.md`
**TDD:** `docs/tdd-feature-name.md`

## Sub-Issues

Sub-issues will be linked automatically below.

## Acceptance Criteria

- [ ] All sub-issues are complete
- [ ] [Any phase-level integration criteria from the PRD]
```

**Labels:** Apply the appropriate `phase:*` label.

### Sub-Issue (Implementation Task)

Sub-issues are the atomic units of work. Each should be completable in a single PR.

**Title format:** Imperative sentence describing the work. Include *where* and *what*.
- Good: "Add email validation to user registration endpoint"
- Bad: "Fix registration"

**Body template:**

```markdown
**Domain:** `[domain/layer]`

[One of: `backend/rust`, `frontend/ts`, `shared/types`, `integration/e2e`,
or a project-appropriate equivalent. Tells the agent which part of the
codebase to study during "analyze before writing." If the issue spans two
domains, list both — but consider splitting the issue instead.]

## Context

[2-3 sentences: why this work is needed, what problem it solves, how it fits into the parent issue. Include enough context that the reader does NOT need to re-read the PRD or TDD.]

## Requirements

[Extracted from the relevant PRD functional requirement(s). Reference by FR number.]

## Technical Reference

[Extracted from the TDD. Include the specific interface contracts, data models, and implementation decisions relevant to this issue. Reference by TDD section. E.g., "See TDD Section 4: LayoutEngine.computeLayout() interface." Include enough detail that the implementer does not need to re-read the full TDD.]

## Implementation Checkpoints

[Ordered steps. Each is a natural commit point. The agent works through
these in order and commits after each one. If context runs long, the agent
stops after any checkpoint — a fresh session picks up from the last commit.]

1. [ ] [First step — usually scaffolding: create files, define types/interfaces]
2. [ ] [Core logic — the main function or component]
3. [ ] [Integration — wire into existing code, connect to callers]
4. [ ] [Tests — 2-8 focused tests covering critical behaviors]

[Adjust the number and content to fit the issue. Low-complexity issues may
have 2 checkpoints. High-complexity issues should have 3-5. Each checkpoint
should produce code that compiles and does not break existing tests.]

## Acceptance Criteria

- [ ] [Specific, testable condition -- use Given/When/Then where appropriate]
- [ ] [Another condition]
- [ ] Unit tests cover success and error paths (2-8 focused tests)
- [ ] All existing tests continue to pass

## Files to Create/Modify

[Derived from the TDD directory structure (Section 5) and interface contracts (Section 4).]

- `path/to/file.ts` -- [what to implement, referencing TDD interface contracts]
- `path/to/file.test.ts` -- [test coverage for the above]

## Implementation Notes

[Architectural hints, patterns to follow, gotchas. Pull from TDD Section 6 (Key Implementation Decisions) and Section 8 (Risk Register) where relevant. Reference existing code patterns where helpful.]

**Agent rules:** Read `.claude/CLAUDE.md` § Agent Execution Rules before
starting. Key points: work in checkpoint order, commit after each, write
2-8 tests max, run only your tests, stay in scope.
```

**Labels:** Apply `type:*` and `complexity:*` labels.

## Granularity Guidance

Each sub-issue should be:

- **Atomic:** Implementable and testable in isolation. One issue = one PR.
- **Right-sized:** Completable within a single agent context window (see § Right-Sizing). If it would require multiple context windows, break it down further. If it's trivially small (a single function with no edge cases), combine it with related work.
- **Self-contained:** Includes enough context, acceptance criteria, and file references to stand alone. The implementer should not need to read the full PRD.
- **Testable:** Acceptance criteria are concrete and checkable. Avoid vague criteria like "works correctly." Prefer "API returns 201 on success and 409 on conflict."

## Testing Directives

Do NOT create separate test-only issues. Instead, embed testing expectations within each implementation sub-issue:

- Every sub-issue's acceptance criteria must include: "Unit tests cover success and error paths" (or equivalent appropriate to the work).
- For complex logic, add specific test scenarios to the acceptance criteria using Given/When/Then:
  ```
  - [ ] Given a duplicate project name, When the user submits, Then the API returns 409
  ```
- Testing conventions (framework, file locations, coverage thresholds, how to run tests) belong in the repository's `CLAUDE.md`, `copilot-instructions.md`, or `AGENTS.md` -- not repeated in every issue.
- For critical features, consider noting in the parent issue: "Generate test skeletons from acceptance criteria before implementing." This gives the agent a concrete target.

## Creating Issues via `gh` CLI

### Creating a parent issue

Write the issue body to a temporary file, then pass it with `--body-file`.
This avoids heredoc quoting issues when the body contains code snippets,
backticks, or single quotes.

```bash
# 1. Write body to a temp file (use Write tool, not heredoc)
#    File: .tmp/parent-body.md
#    Contents:
## Overview

Description here.

**PRD:** `docs/prd-feature-name.md`

## Acceptance Criteria

- [ ] All sub-issues are complete

# 2. Create the issue
gh issue create \
  --title "Feature Name: Phase Description" \
  --label "phase:data" \
  --body-file .tmp/parent-body.md
```

Capture the issue number from the output URL for linking sub-issues.

### Creating a sub-issue

```bash
# 1. Write body to a temp file (use Write tool, not heredoc)
#    File: .tmp/sub-body.md
#    Contents:
## Context

...

## Acceptance Criteria

- [ ] ...
- [ ] Unit tests cover success and error paths

## Files to Modify

- ...

# 2. Create the issue
gh issue create \
  --title "Add email validation to user registration endpoint" \
  --label "type:feature" \
  --label "complexity:low" \
  --body-file .tmp/sub-body.md
```

### Linking a sub-issue to its parent

```bash
# Get the internal ID of the sub-issue
CHILD_ID=$(gh issue view <child-number> --json id --jq '.id')

# Link as sub-issue
gh api "repos/{owner}/{repo}/issues/<parent-number>/sub_issues" \
  -f sub_issue_id="$CHILD_ID"
```

### Setting a dependency between issues

```bash
# If issue #5 is blocked by issue #3
BLOCKED_ID=$(gh issue view 5 --json id --jq '.id')
BLOCKING_ID=$(gh issue view 3 --json id --jq '.id')

gh api graphql \
  -f query='
    mutation($blockedId: ID!, $blockingId: ID!) {
      addIssueDependency(input: {
        issueId: $blockedId,
        dependsOnIssueId: $blockingId
      }) {
        issue { title }
      }
    }
  ' \
  -f blockedId="$BLOCKED_ID" \
  -f blockingId="$BLOCKING_ID"
```

Note: The sub-issues REST API and the dependencies GraphQL API may change. If a command fails, check `gh api --help` and the GitHub docs for current syntax.

## Interaction Model

The process requires a pause after drafting parent issues to get user confirmation ("Go") before creating anything in GitHub. This ensures the high-level plan aligns with user expectations before issues are created. Once confirmed, all issues are created in a single batch.

## Target Audience

Assume the primary readers of the generated issues are:
- A **junior developer** who will implement the feature with awareness of the existing codebase context
- An **AI coding agent** (e.g., GitHub Copilot, Claude Code) that may be assigned individual issues

Each issue must contain enough context to stand alone. Do not assume the reader has read the PRD, other issues, or prior conversation.

## Final Instructions

1. Do NOT begin implementation — only create the issues.
2. Always wait for user confirmation before creating issues in GitHub.
3. **Never generate sub-issues for more than one parent in a single context
   window.** See Context Management.
4. **Never create more than 5 sub-issues in a single execution invocation.**
   This is a context cap, not a scoping target. See Context Management.
5. **Use the two-phase process:** plan sub-issues first (Phase 2a), then
   create them (Phase 2b). See Process.
6. **Run the self-validation checklist before finishing every invocation.** See
   Context Management.
7. Every sub-issue must have testable acceptance criteria.
8. Prefer fewer, well-scoped issues over many trivial ones. See § Right-Sizing.
9. Reference specific files from the TDD directory structure and existing code
   patterns in each issue.
10. Every sub-issue must include relevant interface contracts and data models
    from the TDD.
11. Every sub-issue must reference applicable implementation decisions and risk
    mitigations from the TDD.
12. After creating all issues, print a summary table with issue numbers and
    URLs.
