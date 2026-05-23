# Agent Observability

## Purpose

Track token usage, tool calls, and duration for every subagent invocation.
This data lets us:

- Detect issues that are too large (burned the full context window)
- Calibrate right-sizing heuristics over time
- Compare agent performance across domains and task types

## How It Works

A `SubagentStop` hook fires automatically whenever a subagent finishes.
The hook:

1. Reads the agent's transcript (JSONL)
2. Extracts token usage, tool use count, and timestamps
3. Extracts semantic metadata from the `AGENT_META` tag in the task prompt
4. Appends a structured JSON line to `.agent-stats.jsonl` in the project root

No agent self-reporting is required. The data capture is deterministic.

## Log File

**Location:** `<project-root>/.agent-stats.jsonl` (gitignored)

**Schema:**

```json
{
  "timestamp": "2026-02-08T11:30:00Z",
  "agent_id": "a748479",
  "subagent_type": "general-purpose",
  "meta": {
    "type": "issue-creation",
    "parent": 5,
    "domain": "frontend/ts"
  },
  "total_tokens": 61295,
  "tool_uses": 34,
  "started_at": "2026-02-08T11:00:00.000Z",
  "ended_at": "2026-02-08T11:05:09.056Z"
}
```

**Fields:**

| Field | Source | Description |
|---|---|---|
| `timestamp` | Hook | When the log entry was written |
| `agent_id` | Hook input | Claude Code's internal agent identifier |
| `subagent_type` | Hook input | Structural agent type (`general-purpose`, `Explore`, `Plan`, `Bash`) |
| `meta` | Task prompt | Semantic metadata (see AGENT_META convention below) |
| `total_tokens` | Transcript | Sum of input + output + cache tokens across all API calls |
| `tool_uses` | Transcript | Count of tool_use content blocks |
| `started_at` | Transcript | Timestamp of first transcript entry |
| `ended_at` | Transcript | Timestamp of last transcript entry |

## AGENT_META Convention

When spawning a subagent via the Task tool, include an `AGENT_META` line
in the prompt with a JSON object describing the task semantically:

```
AGENT_META: {"type": "issue-creation", "parent": 5, "domain": "frontend/ts"}
```

The hook extracts this automatically. No other action is needed.

### `type` values

| Value | When to use |
|---|---|
| `issue-creation` | Generating GitHub issues from PRD/TDD |
| `code-implementation` | Implementing an issue (writing code) |
| `code-review` | Reviewing code changes |
| `planning` | Designing approach or architecture |
| `exploration` | Researching codebase, searching for patterns |
| `audit` | Validating quality, checking coverage |
| `testing` | Running or writing tests |

### Optional fields

- `parent` — Parent issue number (for issue-creation and code-implementation)
- `issue` — Specific issue number being worked on
- `domain` — Code domain (`backend/rust`, `frontend/ts`, `shared/types`, etc.)
- Any other key-value pairs relevant to the task

## Files

| File | Purpose |
|---|---|
| `.claude/hooks/log-subagent-stats.sh` | The hook script |
| `.claude/settings.local.json` | Hook registration (SubagentStop event) |
| `.agent-stats.jsonl` | Output log (gitignored) |

## Analyzing the Data

### Quick summary

```bash
# Count entries by agent type
jq -r '.meta.type // "unknown"' .agent-stats.jsonl | sort | uniq -c | sort -rn

# Find agents that used the most tokens
jq -r '[.meta.type, .meta.parent // "", .total_tokens] | @tsv' .agent-stats.jsonl | sort -t$'\t' -k3 -rn | head

# Average tokens by task type
jq -r '[.meta.type // "unknown", .total_tokens] | @tsv' .agent-stats.jsonl | awk -F'\t' '{sum[$1]+=$2; cnt[$1]++} END {for (k in sum) print k, sum[k]/cnt[k]}' | sort -k2 -rn
```

### Spotting over-sized issues

If the context window is ~100k tokens, any agent exceeding ~80k tokens
likely hit context pressure. Filter for those:

```bash
jq 'select(.total_tokens > 80000)' .agent-stats.jsonl
```

Use this to refine right-sizing heuristics: issues in those domains may
need smaller scope or more checkpoints.

## Limitations

- **Token count is approximate.** It sums input + output + cache tokens
  from the transcript, which double-counts cached tokens across turns.
  Treat it as a relative measure, not an exact cost.
- **No per-checkpoint granularity.** We log one entry per agent, not per
  checkpoint. If an agent completes 3 of 5 checkpoints before stopping,
  we see the total, not the breakdown.
- **SubagentStop availability.** If Claude Code doesn't fire SubagentStop
  for a particular agent type or version, the entry won't be logged.
  Monitor `.agent-stats.jsonl` during early runs to confirm entries appear.
