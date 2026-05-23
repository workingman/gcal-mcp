# Development Process

Structured workflow for AI-assisted software development with autonomous agent execution.

**Created by:** Sense and Motion (Vancouver, BC)
**Enhanced with:** Best practices from Agent OS by Brian Casel (Builder Methods)
**Status:** Production-validated (calendar-mcp: 63 issues, 298 tests, 90.71% coverage, ~7 hours)

## Quick Reference

| Scenario | Start Here | Next Steps |
|----------|------------|------------|
| 🆕 New project | `ideate.md` (CREATE) | → problem-statement.md → create-prd.md |
| ✨ Add feature | `ideate.md` (EVOLVE) | → feature-proposal.md → create-prd.md |
| 🐛 Fix bug (small) | Fix directly | No process needed (<50 lines, single file) |
| 🐛 Fix bug (large) | `ideate.md` (MAINTAIN) | → bug-analysis.md → create-prd.md |
| 🔧 Refactor | `ideate.md` (REFACTOR) | → refactoring-plan.md → create-prd.md (Phase 1) |

## Quick Start

**👉 Always start here:** `process/ideate.md`

Whether you're building a new project, adding features, fixing bugs, or refactoring, **IDEATE** is your entry point.

**New to this process?** Read `process/ENHANCEMENTS.md` for overview and `standards/ATTRIBUTION.md` for credits.

## Pipeline

```
   IDEATE       →  create-prd  →  create-tdd  →  create-issues  →  execute-issues  →  first-run-qa
(start here!)      (WHAT)         (HOW)         (WHO)            (parallel)         (verify)

🆕 CREATE          Problem        Tech          GitHub Issues    6 agents          BUILD
✨ EVOLVE          definition,    stack,        with             implement         BOOT
🐛 MAINTAIN        FRs,           schemas,      dependencies     63 issues in      RENDER
🔧 REFACTOR        acceptance     contracts,                     ~7 hours          FUNCTION
                   criteria       directory                                        POLISH
                                  structure
```

## Process Files

| File | Purpose | When to Use |
|------|---------|-------------|
| **`ideate.md`** | **START HERE** - Requirements gathering and problem definition | Always (CREATE, EVOLVE, MAINTAIN, REFACTOR) |
| `create-prd.md` | Generate Product Requirements Document | After ideation, defines WHAT to build |
| `create-tdd.md` | Generate Technical Design Document | After PRD, defines HOW to build |
| `create-issues.md` | Decompose PRD+TDD into GitHub Issues with dependencies | After TDD, defines WHO does what |
| `execute-issues.md` | Orchestrate parallel agent execution | After issues created, implements code |
| `first-run-qa.md` | Systematic 5-layer QA process | After implementation, verifies correctness |
| `agent-observability.md` | Monitor agent progress and token usage | During execution, tracks health |

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

## Standards Library

**Location:** `process/standards/`

**Always apply:**
- `standards/global/coding-style.md` - Naming, formatting, DRY principles
- `standards/global/error-handling.md` - User-friendly errors, retry strategies
- `standards/global/conventions.md` - Project structure, file organization

**Apply when relevant:**
- `standards/backend/api.md` - REST API design, versioning
- `standards/backend/models.md` - Data modeling, validation
- `standards/frontend/components.md` - Component architecture, state management
- `standards/testing/test-writing.md` - Coverage strategy, mocking practices

**Attribution:** Standards adapted from Agent OS by Brian Casel (Builder Methods). See `process/standards/ATTRIBUTION.md`.

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
