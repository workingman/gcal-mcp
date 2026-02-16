# Rule: Executing GitHub Issues with AI Agents

## Goal

To guide an AI assistant in orchestrating autonomous execution of GitHub Issues by spawning subagents that implement code, write tests, and close issues. This is the execution complement to `process/create-issues.md`.

## Prerequisites

- Issues have been created via `process/create-issues.md`
- Issues are right-sized (completable in one agent context window)
- Issues have clear acceptance criteria and implementation checkpoints
- The codebase has standards defined (e.g., `docs/standards/general.md`)
- Agent execution rules are in `.claude/CLAUDE.md`

## Overview

Execution happens in **one agent per parent issue**. Each agent works through that parent's sub-issues either sequentially or in parallel based on dependencies. The orchestrator (main session) spawns these agents with carefully scoped context to maximize efficiency and parallelism.

## Orchestrator Responsibilities

Before spawning execution agents:

1. **Fetch issue details** - Use `gh issue view <number> --json title,body` for parent and all sub-issues
2. **Query dependencies from GitHub** - Use the GraphQL API (see below) to fetch dependency relationships encoded during issue creation. This tells you which sub-issues can run in parallel vs must run sequentially.
3. **Build execution plan** - Construct a dependency graph and determine parallelization opportunities based on the fetched dependencies
4. **Extract relevant TDD sections** - Don't send full TDD, only relevant excerpts
5. **Snapshot current state** - What files exist, what tests are passing, what's the project structure
6. **Determine domain boundaries** - Which directories/files this agent can touch
7. **Construct execution prompt** - Use template below, including the dependency graph
8. **Spawn agent** - Use `Task` tool with `subagent_type: general-purpose` and `run_in_background: true` for parallel execution

## Querying and Using Dependencies

### Fetching dependencies for sub-issues

For each sub-issue, query its dependencies to build the execution plan:

```bash
# Query dependencies for a batch of issues
for issue_num in 103 104 105 106; do
  gh api graphql \
    -f query='
      query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $number) {
            number
            title
            trackedInIssues(first: 100) {
              nodes {
                number
                title
              }
            }
          }
        }
      }
    ' \
    -f owner="$OWNER" \
    -f repo="$REPO" \
    -F number=$issue_num
done
```

- `trackedInIssues` = issues that must complete before this one (dependencies)
- If `trackedInIssues` is empty, the issue has no dependencies and can start immediately
- Issues with the same dependencies can potentially run in parallel

### Building the execution plan

1. **Construct dependency graph:** For each issue, note which issues block it
2. **Identify execution waves:**
   - Wave 1: Issues with no dependencies
   - Wave 2: Issues whose dependencies are all in Wave 1
   - Wave 3: Issues whose dependencies are in Waves 1-2
   - Continue until all issues are assigned
3. **Determine parallelization:**
   - Within each wave, issues can run in parallel if they don't share files
   - Check the "Files to Create/Modify" section in each issue to verify no conflicts
4. **Document execution strategy** in the agent prompt

Example dependency graph:
```
Wave 1 (no deps):    #103
Wave 2 (deps: 103):  #104
Wave 3 (deps: 104):  #105, #106 (can run in parallel - different files)
```

## Orchestrator Context Management (CRITICAL)

### Why Orchestrator Monitoring is Required

**Key Learning:** Agents CANNOT reliably self-monitor their own context usage. They lack visibility into token counts and may claim to be "at 80%" when they're actually at 95% or have already exceeded limits.

**Problem if not managed:**
- Agents hit the 200k hard limit with no graceful shutdown
- No opportunity to commit progress or update issues
- Work lost, must manually reconstruct state
- GitHub issues left in inconsistent states

**Solution:** The orchestrator (you) must actively monitor spawned agents and proactively intervene.

### Monitoring Strategy

**For each spawned agent, track context usage externally:**

1. **Use TaskOutput with block=false to check progress:**
   ```bash
   # Non-blocking check of agent status
   TaskOutput(task_id="<agent-id>", block=false, timeout=1000)
   ```

2. **Watch for token usage in output:**
   - Output may include token counts or context warnings
   - If not visible, estimate based on agent activity duration

3. **Use git log to verify progress:**
   ```bash
   # Check commits from the last N minutes
   git log --oneline --since="15 minutes ago"
   ```

### Intervention Thresholds

**Monitor and intervene at these levels:**

| Token Usage | Orchestrator Action |
|------------|---------------------|
| 0-120k (0-60%) | Continue monitoring, no action needed |
| 120k-140k (60-70%) | Increase monitoring frequency, prepare for intervention |
| 140k-160k (70-80%) | **INTERVENE** - Stop agent proactively (see procedure below) |
| 160k-180k (80-90%) | **CRITICAL** - Stop immediately if not already stopped |
| 180k+ (90%+) | **EMERGENCY** - Stop now, risk of incomplete state |

**Why 70-80% threshold:** Provides safety margin for agent to commit work, update checkboxes, and shut down gracefully (~20-40k tokens).

### Intervention Procedure

When agent reaches 140k-160k tokens (70-80%):

**Step 1: Stop the agent gracefully**
```bash
TaskStop(task_id="<agent-id>")
```

**Step 2: Read git log to determine checkpoint progress**
```bash
git log --oneline --since="30 minutes ago" --grep="#<parent-number>"
```

Identify which sub-issues have been completed (committed) and which are in progress.

**Step 3: Update GitHub issues with progress**

For completed sub-issues:
```bash
# Mark checkboxes and close
BODY=$(gh issue view <issue-number> --json body -q .body)
BODY=$(echo "$BODY" | sed 's/- \[ \] /- [x] /g')
gh issue edit <issue-number> --body "$BODY"
gh issue close <issue-number> -c "Completed by agent <agent-id>. All acceptance criteria met."
```

For in-progress sub-issues:
```bash
# Mark completed checkpoints only
BODY=$(gh issue view <issue-number> --json body -q .body)
# Update specific checkpoints based on git log/output analysis
BODY=$(echo "$BODY" | sed 's/- \[ \] Checkpoint 1:/- [x] Checkpoint 1:/')
gh issue edit <issue-number> --body "$BODY"

# Add comment with resumption context
gh issue comment <issue-number> -b "Agent <agent-id> context depleted at 80%. Checkpoint 1 complete (commit <SHA>). Resume from Checkpoint 2."
```

**Step 4: Spawn fresh agent with updated "Current State"**

Update the execution prompt's "CURRENT STATE" section with:
- What has been completed (closed issues)
- What is in progress (partial issue, which checkpoint)
- Recent commits and file changes
- Updated "Existing files in your domain" list

Then spawn new agent with same parent but updated context.

### Agent Prompt Updates

**Remove self-monitoring language from agent prompts.** Agents should focus on work, not context tracking.

**Old (unreliable):**
> "If context grows large (>80% full) before completing the sub-issue, commit and STOP."

**New (orchestrator-driven):**
> "Work through sub-issues in order. Commit after each completion. The orchestrator monitors your context usage and will stop you if needed - if stopped, your progress will be checkpointed and a fresh agent will resume."

**In CHECKPOINT PROTOCOL section, replace self-monitoring with:**
> "The orchestrator actively monitors your context usage. If you are stopped mid-issue due to context limits, your commits serve as checkpoints. The orchestrator will update issue progress and spawn a fresh agent to continue from your last commit."

### Monitoring During Execution

**Recommended monitoring loop (for orchestrator):**

```bash
# Check agent progress every 5-10 minutes
while agent_running; do
  # Check token usage (via TaskOutput or output file)
  tokens=$(get_token_usage "$agent_id")

  # Check git commits
  commits=$(git log --oneline --since="5 minutes ago" --grep="#$parent_number" | wc -l)

  echo "Agent $agent_id: $tokens tokens, $commits recent commits"

  # Intervene if approaching threshold
  if [ "$tokens" -gt 140000 ]; then
    echo "INTERVENTION: Agent $agent_id at 70%+ context, stopping..."
    intervention_procedure "$agent_id" "$parent_number"
    break
  fi

  sleep 300  # Check every 5 minutes
done
```

### Context Budget Planning

**Rough token estimates per issue (from experience):**
- Simple issue (basic function, 3-5 tests): ~10-15k tokens
- Medium issue (API endpoint, 8-12 tests): ~20-30k tokens
- Complex issue (multi-file refactor, integration tests): ~40-60k tokens

**For a 200k context window:**
- Plan for ~120-140k tokens of productive work (60-70%)
- Reserve 40-60k tokens for orchestrator overhead, error recovery, checkpointing

**If parent has >5 medium issues or >3 complex issues:**
- Expect context to deplete before completion
- Plan for 2-3 agent spawns per parent
- OR split parent into smaller execution batches

### Key Principles

1. **Agents cannot self-monitor** - Context usage is invisible to them
2. **Orchestrator owns monitoring** - External visibility is reliable
3. **Proactive intervention** - Stop at 70-80%, not 90-95%
4. **Git commits are source of truth** - Not GitHub issue state
5. **Clean handoffs** - Always update issues before respawning
6. **Safety margin matters** - 20-40k token buffer for graceful shutdown

### See Also

- SESSION_NOTES.md § "Key Learnings & Process Improvements" - Real-world validation of this approach
- Lines 228-249 below (Checkpoint Protocol) - What agents see (simplified, no self-monitoring)

---

## Agent Execution Prompt Template

```markdown
You are an autonomous execution agent for the <PROJECT_NAME> project.

Your mission: Execute <N> sub-issues for Parent #<PARENT_NUMBER> (<PARENT_TITLE>).

## CRITICAL RULES

1. **Bash pattern:** Single-line commands run directly. Multi-line scripts: Write to
   `.tmp/agent-p<PARENT_NUMBER>-<name>.sh`, then run `bash run.sh .tmp/agent-p<PARENT_NUMBER>-<name>.sh`.

2. **Commit after each sub-issue.** Use explicit file paths:
   `git add path/to/file1.ts path/to/file2.test.ts`
   NEVER use `git add .` or `git add -A` (risks staging other agents' work).
   Format: `<imperative summary> (#<issue-number>)`

3. **Close issues only when fully complete.** Before closing a sub-issue, verify:
   - All implementation checkpoints are complete
   - All acceptance criteria are met and tests pass
   - Code is committed and pushed
   Then mark all checkboxes complete and CLOSE THE ISSUE with `gh issue close <number>`.
   This is MANDATORY. Issues left open indicate incomplete work. NEVER close an issue
   if any checkpoint or acceptance criterion is incomplete.

4. **Test incrementally.** Write 2-8 tests per issue. Run ONLY your new tests during
   development. Run full test suite only after completing ALL sub-issues.

5. **Stay in your lane.** Domain: `<DOMAIN>`. Work in: <LIST_OF_ALLOWED_DIRECTORIES>.
   Do NOT touch: <LIST_OF_FORBIDDEN_DIRECTORIES>.

6. **Read standards first:** `<STANDARDS_PATH>` - Key limits: <KEY_LIMITS_SUMMARY>

7. **Follow checkpoints.** Each issue has 2-5 checkpoints. Work through them in order.
   Commit after completing each sub-issue. The orchestrator monitors your context usage
   and will stop you if needed - focus on completing work, not tracking context.

8. **Update issue checkboxes only when closing.** Do one bulk update (mark all
   checkboxes complete) right before closing. Exception: if stopping mid-issue due
   to context limit, update to show completed checkpoints for resumption. Progress
   visibility during execution comes from git commits, not issue updates.

## PROJECT CONTEXT

**Project root:** `<PROJECT_ROOT>`
**Tech stack:** <TECH_STACK_SUMMARY>
**Test runner:** `<TEST_COMMAND>` (<CURRENT_TEST_COUNT> tests currently passing)
**Lint:** `<LINT_COMMAND>`
**Build:** `<BUILD_COMMAND>` (if applicable)

## CURRENT STATE

**Existing files in your domain:**
<LIST_OF_RELEVANT_EXISTING_FILES_WITH_BRIEF_DESCRIPTION>

**Existing types/interfaces you'll use:**
<LIST_OF_RELEVANT_TYPES_FROM_SHARED_FILES>

**Recent commits (context):**
<LAST_3_COMMITS_FOR_CONTEXT>

## EXECUTION STRATEGY

**Dependency graph (from GitHub issue dependencies):**
<VISUAL_DEPENDENCY_GRAPH>

The graph below was constructed by querying GitHub's dependency API during
orchestration. It shows which issues block others and which can run in parallel.

Example:
```
Wave 1 (no deps):    #103
Wave 2 (deps: 103):  #104
Wave 3 (deps: 104):  #105, #106 (parallel - different files)
```

**Execution plan:**
<STEP_BY_STEP_EXECUTION_PLAN>

Based on the dependency graph, execute in this order:

Example:
1. Implement #103 → verify all checkpoints/criteria → close #103
2. Implement #104 → verify all checkpoints/criteria → close #104
3. Implement #105 → verify all checkpoints/criteria → close #105
4. Implement #106 → verify all checkpoints/criteria → close #106
5. Final verification: run full test suite, verify all issues closed

**Critical:** Close each issue immediately after completing it (all checkpoints done,
all acceptance criteria met, tests passing). Do NOT wait until the end to close issues.

**Parallelization note:** You are a single agent executing sequentially. The orchestrator
may spawn additional agents for other parents or other execution waves in parallel.
Focus on your assigned work and follow the execution plan order.

## TECHNICAL CONTEXT

These excerpts from the TDD provide the contracts and decisions relevant to your work.
DO NOT read the full TDD file - everything you need is below.

### Interface Contracts (TDD §4)
<PASTE_ONLY_RELEVANT_INTERFACE_CONTRACTS>

### Data Models (TDD §3)
<PASTE_ONLY_RELEVANT_DATA_MODELS>

### Key Implementation Decisions (TDD §6)
<PASTE_ONLY_RELEVANT_DECISIONS>

### Risk Mitigations (TDD §8)
<PASTE_ONLY_RELEVANT_RISKS>

## SUB-ISSUE #<N>: <TITLE>

**Domain:** `<DOMAIN>`

### Context
<CONTEXT_FROM_ISSUE>

### Requirements
<REQUIREMENTS_FROM_ISSUE>

### Implementation Checkpoints
<CHECKPOINTS_FROM_ISSUE>

### Acceptance Criteria
<ACCEPTANCE_CRITERIA_FROM_ISSUE>

### Files to Create/Modify
<FILES_LIST_FROM_ISSUE>

### Implementation Notes
<NOTES_FROM_ISSUE>

---

[REPEAT FOR EACH SUB-ISSUE]

---

## CHECKPOINT PROTOCOL

Each sub-issue has 2-5 checkpoints. Work through them in order.

**After completing each checkpoint:**
1. Verify code compiles/runs
2. Run your new tests
3. If checkpoint is the last one for this sub-issue:
   a. Commit the code
   b. Verify ALL acceptance criteria are met
   c. Mark all checkboxes complete
   d. Close the issue with `gh issue close <number>`

**Orchestrator Context Management:**

The orchestrator actively monitors your context usage and will stop you if you approach token limits (70-80% of 200k tokens). You do NOT need to self-monitor context.

**If stopped mid-issue by orchestrator:**
- Your commits serve as automatic checkpoints
- The orchestrator will read git log to determine progress
- The orchestrator will update issue checkboxes for completed checkpoints
- A fresh agent will be spawned to resume from your last commit

**Your responsibility:** Focus on completing work and committing after each sub-issue (or checkpoint if logical). The orchestrator handles context management.

**Exception - If you detect problems independently:**
If you encounter blocking issues (missing dependencies, unexpected test failures, etc.):
1. Commit progress so far with descriptive message
2. STOP and report the blocker clearly
3. The orchestrator will file issues or spawn specialized agents to unblock

## ISSUE PROGRESS TRACKING

**Before closing an issue, verify completion:**

1. **All implementation checkpoints are complete** - Review the issue body and confirm every checkpoint is done
2. **All acceptance criteria are met** - Verify each criterion in the issue:
   - Run the tests you wrote (they must pass)
   - Verify the behavior matches the requirements
   - Check that edge cases are handled
3. **Code is committed** - All work is in git with proper commit message
4. **No errors or warnings** - Your tests pass, code compiles/lints clean

**Only after verification, close the issue:**

```bash
# 1. Mark all checkboxes complete
BODY=$(gh issue view <issue-number> --json body -q .body)
BODY=$(echo "$BODY" | sed 's/- \[ \] /- [x] /g')
gh issue edit <issue-number> --body "$BODY"

# 2. Close with verification statement
gh issue close <issue-number> -c "All checkpoints and acceptance criteria complete. Tests passing."
```

**NEVER close an issue if:**
- Any checkpoint is incomplete
- Any acceptance criterion is not met
- Tests are failing
- Code is not committed

**Exception: If stopping mid-issue due to context limit:**
Update the issue to show which checkpoints are done before stopping:

```bash
# Mark completed checkpoints (be specific)
BODY=$(gh issue view <issue-number> --json body -q .body)
BODY=$(echo "$BODY" | sed 's/- \[ \] Checkpoint 1:/- [x] Checkpoint 1:/')
BODY=$(echo "$BODY" | sed 's/- \[ \] Checkpoint 2:/- [x] Checkpoint 2:/')
gh issue edit <issue-number> --body "$BODY"

# Add comment explaining status
gh issue comment <issue-number> -b "Context limit reached. Checkpoints 1-2 complete. Resume from Checkpoint 3."
```

**Why minimal updates:**
- GitHub API rate limits (5,000 requests/hour)
- Each update = fetch + upload entire issue body (~500-800 tokens)
- Network latency adds 200-500ms per update
- Orchestrator can track progress via git commits during execution
- Issue checkboxes matter most for final state and resumption

**Progress visibility during execution:** Use git commits, not issue updates.
Orchestrator can run `git log --oneline --since="10 minutes ago"` to see progress.

## GIT PROTOCOL

**Before committing:**
```bash
# Stage only your files explicitly
git add src/path/to/file1.ts src/path/to/file2.test.ts

# Verify staged files are correct
git diff --cached --name-only

# If unexpected files appear, reset and re-stage
git reset
git add <explicit-paths-only>
```

**Commit message format:**
```
<imperative summary> (#<issue-number>)

- Checkpoint 1: <what was done>
- Checkpoint 2: <what was done>
- Tests: <X tests added, all passing>
```

**Parallel safety:**
- Other agents may be running on different domains
- NEVER stage files outside your domain
- If `git status` shows unexpected changes, ignore them (another agent's work)

## TEST STRATEGY

**Per sub-issue (incremental):**
```bash
# Write 2-8 focused tests
# Run ONLY your new tests
<TEST_COMMAND> path/to/your-new.test.ts

# Verify they pass before committing
```

**After completing ALL sub-issues (verification):**
```bash
# Run full test suite
<TEST_COMMAND>

# Run lint
<LINT_COMMAND>

# If existing tests break, fix them or report the breakage
```

**Why:** Running the full suite after each sub-issue wastes time. Test incrementally,
verify at the end.

## ERROR RECOVERY

**If you discover a missing dependency:**
- DO NOT attempt to implement it (out of scope)
- Document: `// TODO: Depends on #XYZ (not yet implemented)`
- File a new issue: `gh issue create --title "..." --label "type:bug"`
- Continue with stub/mock if possible, or stop at checkpoint

**If tests fail unexpectedly:**
- Check if it's your code or a pre-existing issue
- If pre-existing, file a bug but continue your work
- If your code, fix before committing

**If build/lint fails:**
- Fix before proceeding to next sub-issue
- Lint errors must be resolved before committing

**If context depletes before completion:**
- See CHECKPOINT PROTOCOL above

**If you're blocked:**
- Commit progress so far
- Report blocker clearly
- File issue for unblocking work if needed

## COMPLETION REPORT

After completing all sub-issues, provide this report:

```markdown
## Execution Complete: Parent #<PARENT_NUMBER>

**Sub-issues completed:** #<n1>, #<n2>, #<n3>...

**Commits:**
- <SHA> - <message>
- <SHA> - <message>
...

**Metrics:**
- Files created: <N>
- Files modified: <N>
- Tests added: <N>
- Test results: <N> new tests passed, <N> existing tests still passing
- Lint: Clean / <N> issues fixed
- Build: Success / N/A

**Coverage verification:**
- ✓ All checkpoints completed
- ✓ All acceptance criteria met
- ✓ All "Files to Create/Modify" addressed
- ✓ Standards compliance verified

**Issues closed:** (all checkboxes checked before closing)
- https://github.com/<owner>/<repo>/issues/<n1>
- https://github.com/<owner>/<repo>/issues/<n2>
...

**Blockers encountered:** None / <description>

**Recommendations for future right-sizing:**
- Issue #<n> was well-scoped, completed in <X>% of context
- Issue #<n> was too large, required checkpoint split
- Issue #<n> could be split into <suggestion>
```

## ORCHESTRATOR INSTRUCTIONS

After the agent reports completion:

1. **Verify execution:**
   - Check that all commits are on the branch
   - Verify tests pass: `<TEST_COMMAND>`
   - Verify lint clean: `<LINT_COMMAND>`
   - **Verify ALL sub-issues are closed on GitHub** (use `gh issue list --parent <PARENT_NUMBER>` to check)

2. **Close parent issue (ONLY if all sub-issues are closed):**
   ```bash
   # First verify all sub-issues are closed
   OPEN_SUBS=$(gh issue list --parent <PARENT_NUMBER> --state open --json number --jq 'length')
   if [ "$OPEN_SUBS" -eq 0 ]; then
     gh issue close <PARENT_NUMBER> -c "All <N> sub-issues complete. <summary>"
   else
     echo "ERROR: Cannot close parent - $OPEN_SUBS sub-issues still open"
     gh issue list --parent <PARENT_NUMBER> --state open
   fi
   ```

3. **Update task tracking:**
   - Mark parent task as completed
   - Note any recommendations for right-sizing adjustments

4. **Proceed to next parent or verification:**
   - If more parents remain, spawn next execution agent
   - If all parents complete, proceed to `process/first-run-qa.md`
```

## Example: Spawning an Execution Agent

```typescript
// In the orchestrator session:

// 1. Fetch and analyze
const parent = await fetchIssue(2);
const subIssues = await fetchSubIssues([103, 104, 105, 106]);
const tddExcerpts = extractRelevantSections(tdd, parent);
const dependencies = analyzeDependencies(subIssues);

// 2. Construct prompt (fill template above)
const prompt = buildExecutionPrompt({
  projectName: "mmv",
  parentNumber: 2,
  parentTitle: parent.title,
  subIssues: subIssues,
  domain: "backend/rust",
  allowedDirs: ["src-tauri/src/commands/", "src-tauri/src/watchers/"],
  forbiddenDirs: ["src/", "tests/integration/"],
  tddExcerpts: tddExcerpts,
  dependencies: dependencies,
  currentState: snapshotCurrentState(),
});

// 3. Spawn agent
await spawnAgent({
  description: "Execute Parent #2 Rust Backend",
  subagentType: "general-purpose",
  runInBackground: true,
  prompt: prompt,
});
```

## Orchestration Patterns

All patterns use the dependency graph from GitHub to determine execution order.
Query dependencies as shown in "Querying and Using Dependencies" above.

### Sequential Execution (safest)
Spawn one agent at a time, wait for completion before spawning next.
- Use when: First time using the process, want to minimize git conflicts, or learning the codebase
- Pros: Simple, predictable, minimal conflicts, easier debugging
- Cons: Slower wall-clock time (no parallelization)
- Implementation: Process dependency waves one at a time

### Parallel Execution by Wave (recommended)
Spawn multiple agents for issues in the same dependency wave simultaneously.
- Use when: Issues in the same wave touch different files/domains
- Pros: 2-3x faster for well-decomposed work, respects dependencies automatically
- Cons: Requires careful file boundary analysis
- Implementation: Query dependencies → identify waves → spawn agents for Wave 1 → wait → spawn Wave 2 → etc.
- Example: Wave 1 has #103 (backend), #110 (frontend) → spawn both in parallel

### Parallel Execution by Domain (alternative)
Spawn multiple agents for different parent issues (domains) simultaneously.
- Use when: Parents touch completely different directories (backend vs frontend)
- Pros: Maximum parallelism across major domains
- Cons: Requires parents to be truly independent, more complex git coordination
- Example: P2 (Rust backend), P3 (TS parsing), P6 (TS viewport) can all run in parallel
- Note: Each parent's agent still respects its internal sub-issue dependency graph

### Hybrid Wave + Domain (advanced)
Combine wave-based and domain-based parallelization.
- Use when: You have multiple independent parents, each with internal dependency waves
- Pros: Maximum parallelism while respecting all dependencies
- Cons: Most complex orchestration logic, requires careful monitoring
- Implementation: Spawn agents for (P2 Wave 1 + P3 Wave 1) → wait for both → spawn (P2 Wave 2 + P3 Wave 2) → etc.

## Context Efficiency Tips

1. **TDD excerpts, not full doc:** Save ~6K tokens per agent
2. **Inline issue bodies, not URLs:** Agent can't fetch them anyway
3. **Compress current state:** List files, don't show full contents
4. **Reference standards, don't repeat:** Standards are already in `.claude/CLAUDE.md`
5. **Use relative complexity hints:** "Issue #103 is low complexity" helps agent budget time

## Monitoring & Debugging

**Check agent progress:**
```bash
# For background agents, tail their output files
tail -f /private/tmp/claude-*/tasks/<agent-id>.output | grep -E "git commit|pnpm test|error"

# Or check git for commits
git log --oneline --since="10 minutes ago"
```

**If agent gets stuck:**
1. Check output file for last action
2. Verify no permission prompts (bash pattern compliance)
3. Check for test failures or lint errors blocking progress
4. Consider spawning fresh session with checkpoint continuation

**If agent reports context limit:**
1. Read last commit to see what checkpoint was completed
2. Spawn fresh agent with same prompt but updated "Current State"
3. Agent will resume from next checkpoint

## Quality Gates

After all agents complete, before merging:

1. **Full test suite:** All tests must pass
2. **Lint clean:** No warnings or errors
3. **Build succeeds:** If applicable
4. **All issues closed:** Verify on GitHub
5. **Git history clean:** No merge conflicts, reasonable commit messages
6. **Standards compliance:** Spot-check for adherence

## Lessons Learned (update as you discover new patterns)

- **TDD excerpt optimization:** Saves ~6K tokens per agent (HIGH value)
- **Git isolation protocol:** Prevents cross-contamination in parallel execution
- **Test incrementally, verify at end:** Faster feedback loop
- **Checkpoint commits:** Enable graceful context degradation
- **Domain boundaries:** Critical for safe parallelization
- **Dependency encoding at creation time:** Encoding dependencies as GitHub issue dependencies during create-issues.md eliminates redundant analysis at execution time and enables automatic parallelization (30-50% speedup for well-decomposed work)

## See Also

- `process/create-issues.md` - How issues were created, sized, and dependencies encoded (see Phase 2b for dependency analysis, see "Querying dependencies" section for GraphQL examples)
- `process/first-run-qa.md` - What happens after execution
- `process/agent-observability.md` - Metrics and monitoring
- `.claude/CLAUDE.md` - Agent execution rules (6 rules)
- `docs/standards/general.md` - Coding standards
