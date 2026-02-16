# Development Process

Reusable prompt templates for AI-assisted software development.

## Pipeline

```
create-prd.md  →  create-tdd.md  →  create-issues.md  →  agents execute issues
     |                  |                   |
  WHAT to build      HOW to build it    WHO does what
  (problem, FRs,     (stack, schemas,   (GitHub Issues
   acceptance         contracts, dir     w/ exit criteria)
   criteria)          structure)
```

## Artifacts

| Template | Purpose |
|---|---|
| `create-prd.md` | Generate a Product Requirements Document from a raw idea |
| `create-tdd.md` | Generate a Technical Design Document from a PRD |
| `create-issues.md` | Decompose a PRD + TDD into self-contained GitHub Issues |
| `first-run-qa.md` | Structured QA process from "implemented" to "works correctly" |

## Quality Assurance

After implementation, use `first-run-qa.md` to systematically verify the project through five layers: BUILD → BOOT → RENDER → FUNCTION → POLISH.

### Starting a QA Session

**To start or resume QA work, use the skill:**

```
/qa-continue
```

This automatically:
1. Reads `process/first-run-qa.md` (the QA process definition)
2. Recovers state from `qa-state.md` and `qa-findings.md`
3. Checks open QA issues
4. Resumes from the recorded position

**State files:**
- `qa-state.md` — current layer, step, cycle, and wisdom summaries
- `qa-findings.md` — append-only log of all findings

### QA Pyramid

```
     POLISH     — Edge cases, perf, UX quality (human-primary)
    FUNCTION    — Features work correctly (automated + manual)
   RENDER       — UI/output appears correctly (human-primary)
  BOOT          — App starts and stays running (agent + 1 confirmation)
 BUILD          — Compiles, bundles, lints cleanly (fully agentic)
```

Each layer gates the next. The process is stateful and survives context depletion.

## Standards

- `docs/standards/general.md` — language-agnostic coding standards (always loaded)
- Language-specific addenda live as Claude Code skills (`.claude/skills/`)
  so they are progressively disclosed when the language is in use

## Greenfield vs. Brownfield

### Greenfield (new project)
The pipeline runs start-to-finish:
1. Write the PRD (problem definition, requirements, acceptance criteria)
2. Write the TDD (all technical decisions, architecture, data models)
3. Generate issues (self-contained tasks agents can execute uninterrupted)
4. Agents execute issues against an empty codebase

### Brownfield (existing codebase)
The pipeline is the same, but Step 2 changes significantly:
- **Codebase assessment is mandatory.** The TDD must document existing
  architecture, conventions, patterns, and module boundaries before
  proposing changes.
- **The TDD "works with" rather than "replaces."** New components must
  integrate with existing patterns unless there's an explicit decision
  to refactor (which becomes its own issue).
- **Standards may already exist.** If the project has established conventions
  (linting config, test patterns, directory structure), the TDD references
  those rather than imposing new ones.
- **Issue scope is constrained.** "Files to Modify" in each issue is
  critical — agents need to know exactly where existing code lives and
  what patterns to follow.
- **Risk is higher.** Brownfield issues must include regression criteria:
  "All existing tests continue to pass."

The prompt templates handle this via the "Assess the Codebase" step in
create-tdd.md and the "Assess Current State" step in create-issues.md.
Both instruct the agent to read the codebase first. For greenfield projects,
those steps simply find nothing and move on.

## Release Planning & Phasing

### Approach to Versioning

This process supports both **timeline-driven** and **feature-driven** release planning:

**Timeline-Driven:**
- Set target dates (Q1, March 15, etc.) in PRD metadata
- Scope features to fit timeline
- Useful for external dependencies or market windows

**Feature-Driven (Default):**
- No fixed timeline - "MVP", "v1.1", "v2.0" as milestones
- Ship when quality gates pass (all issues complete, QA pyramid green)
- Useful for internal tools and exploratory projects

### Phasing Strategy

**Use Implementation Phases in PRD for:**
- Separating must-have from nice-to-have features
- Controlling scope creep during development
- Progressive rollout (MVP → iterate based on feedback)

**Recommended labels:**
- `phase:mvp` - Minimum viable product, first deployment
- `phase:v1.1` - First enhancement wave
- `phase:v2.0` - Major feature addition or architecture change

**Documenting phases in PRD:**
Add a "Functional Requirements Phases" section mapping FR-xxx to releases:
```markdown
## Functional Requirements Phases

### MVP (Initial Release)
- FR-001, FR-002, FR-003 (core read operations)

### v1.1 (Enhancement)
- FR-004, FR-005 (advanced search)

### v2.0 (Future)
- FR-006, FR-007 (write operations)
```

Then issues inherit phase labels from their parent FRs.

---

## TODO: Playbook

Write a comprehensive playbook document that covers:
- Step-by-step walkthrough of bootstrapping a new project with this process
- How to adapt for brownfield projects
- When human input is needed vs. when agents run autonomously
- How to tune task scope (agent time per issue: default max 1 hour)
- How to set up standards and skills for a new project
- Lessons learned and anti-patterns discovered during use
- How the process scales to multi-person, multi-component systems
