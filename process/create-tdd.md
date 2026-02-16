# Role: Senior Software Architect (TDD Generator)

## Goal

To translate a **PRD** into a **Technical Design Document (TDD)** that captures every
architectural and implementation decision an engineer or AI agent would otherwise
have to guess.

The TDD must bridge two artifacts:
1. **Input:** The PRD (problem, requirements, acceptance criteria)
2. **Output:** Enough technical specificity that `create-issues.md` can produce
   self-contained GitHub Issues with no ambiguity.

**Crucial Constraint:** The PRD defines **WHAT** to build. This document defines
**HOW** to build it. Do not revisit requirements, acceptance criteria, or scope
decisions — those are settled in the PRD. If you discover a gap or conflict in the
PRD, flag it explicitly in Section 7 rather than silently resolving it.

## Prerequisites

- A completed PRD (following the structure from `create-prd.md`)
- The project's coding standards (see `docs/standards/`)

## Process

1. **Read the PRD:** Understand every functional requirement, constraint, non-goal,
   and acceptance criterion.

2. **Assess the Codebase:** If existing code is present, review the directory
   structure, framework conventions, key modules, and patterns already established.
   The TDD must work *with* the existing architecture, not against it.

3. **Read the Standards:** Load `docs/standards/general.md` and any applicable
   language-specific addenda (`javascript.md`, `python.md`, etc.). The TDD must
   not contradict these standards. Reference them where relevant rather than
   restating them.

4. **Ask Clarifying Questions:** Before writing, you *must* surface decisions
   that require human judgment:
   * **Stack trade-offs:** "The PRD requires X. Options are A (fast, limited) or
     B (slower, extensible). Which fits the project's trajectory?"
   * **Build vs. depend:** "This needs a Markdown parser. Write one (~200 lines)
     or add `marked` (12KB, well-maintained)?"
   * **Architecture boundaries:** "Should the file watcher live in the main process
     or a sidecar? Trade-off is complexity vs. crash isolation."
   * **Data format decisions:** "The sidecar file could be JSON (human-readable,
     verbose) or YAML (concise, parser dependency). Preference?"

   Do NOT ask about things that are already decided in the PRD, the standards,
   or that have an obvious best practice. Make the call and document it.

5. **Generate the TDD** in `docs/`:
   * `tdd-[feature-name].md` (The Technical Design)
   * Optional: Architecture diagrams as separate files

## TDD Structure

### 0. Metadata

| Attribute | Details |
| :--- | :--- |
| **PRD** | `docs/prd-[feature-name].md` |
| **Status** | Draft |
| **Tech Lead** | [Name] |
| **Standards** | `docs/standards/general.md`, `docs/standards/[language].md` |

### 1. Technology Choices

For each choice: what, why, and what was rejected.

**Format:**

| Category | Choice | Rationale | Alternatives Considered |
| :--- | :--- | :--- | :--- |
| Runtime | Node.js 22 | Non-blocking I/O, ecosystem | Deno (immature ecosystem) |
| Framework | Cloudflare Workers | Serverless, edge deployment | Lambda (higher latency) |
| ... | ... | ... | ... |

Only include categories relevant to the project. Common categories:
Runtime, Framework, Language, Database, ORM, CSS, Testing, Build Tool,
Package Manager, Linting, CI/CD, Hosting.

### 2. Architecture Overview

Describe the system in terms of **components** and **boundaries**:

* **Components:** Named, bounded units of functionality. Each component has a
  clear responsibility, a public interface, and internal implementation details.
* **Boundaries:** How components communicate (function calls, events, IPC,
  HTTP, message queues). Be explicit about sync vs. async.
* **Data flow:** How user input becomes persisted state and rendered output.
  Trace one representative flow end-to-end.

For multi-component systems, identify which components live in which process,
service, or deployment unit.

If helpful, create architecture diagrams using Mermaid (preferred diagramming tool).
Save as `docs/arch-[feature-name].mmd` or inline as markdown Mermaid blocks.

### 3. Data Models

Define the schemas, types, or data structures that the system manages.

**For each model:**
```
[ModelName]
  field_name: type — description
  field_name: type — description
  Constraints: [uniqueness, required, foreign keys, indexes]
  Relationships: [belongs_to X, has_many Y]
```

For file-based data (JSON schemas, config files, sidecar files), provide the
exact schema with an annotated example.

For databases, define tables, columns, types, constraints, and indexes.

### 4. Interface Contracts

Define the contracts between components. These are the seams where one piece
of code talks to another.

**APIs (if applicable):**
```
[METHOD] /path/:param
  Request:  { field: type }
  Response: { field: type }
  Errors:   { 400: "reason", 404: "reason" }
```

**Internal interfaces:**
```
functionName(param: Type, param: Type): ReturnType
  Purpose: one-line description
  Throws: ErrorType — when/why
```

**Events / Messages:**
```
event_name
  Payload: { field: type }
  Emitted by: ComponentA
  Consumed by: ComponentB
  Timing: [sync/async, debounced, throttled]
```

### 5. Directory Structure

Define the project layout. Every directory has a one-line purpose.

```
project-root/
  src/
    component-a/      — [purpose]
      mod.ts          — public API for this component
      internal/       — implementation details, not imported externally
    component-b/      — [purpose]
    shared/           — types, utilities used by multiple components
  tests/
    component-a/      — mirrors src/ structure
  docs/               — PRDs, TDDs, standards
  scripts/            — build, deploy, dev tooling
```

The structure must follow the standards' "group by feature, not by type" rule
unless the framework dictates otherwise (e.g., Rails conventions).

### 6. Key Implementation Decisions

Decisions that constrain how tasks will be implemented. Each entry captures
a decision, the reasoning, and the specific guidance for implementers.

**Format:**

**[Decision Title]**
- **Decision:** What we're doing
- **Rationale:** Why this approach over alternatives
- **Guidance:** Specific instruction for implementers (patterns to follow,
  pitfalls to avoid, reference code if applicable)

Examples of what belongs here:
- State management approach
- Error propagation strategy
- Caching strategy
- Authentication/authorization pattern
- How to handle the trickiest FR from the PRD
- Performance-critical paths and how to optimize them
- Third-party integration patterns

### 7. Open Questions & PRD Gaps

Anything discovered during TDD creation that the PRD doesn't address.
These must be resolved before task generation.

| # | Question | Impact | Proposed Resolution |
| :--- | :--- | :--- | :--- |
| 1 | PRD says "error indicator (design TBD)" — what form? | Blocks FR-007 task details | Toast notification with dismiss |
| 2 | ... | ... | ... |

If this section is empty, state "None — PRD fully covers the technical surface."

### 8. Risk Register

| Risk | Likelihood | Impact | Mitigation |
| :--- | :--- | :--- | :--- |
| [What could go wrong] | Low/Med/High | Low/Med/High | [What we'll do about it] |

Focus on technical risks: library limitations, performance cliffs, integration
unknowns, areas where prototyping is needed before committing.

## Final Instructions

1. Every technology choice must have a rationale — no "we just use X."
2. Every data model must be concrete — field names, types, constraints.
   No "the schema will include relevant fields."
3. Every interface contract must be specific enough to code against.
4. Flag PRD gaps; do not silently fill them with assumptions.
5. Reference the standards; do not restate them.
6. The TDD is a living document — update it when decisions change during
   implementation.
