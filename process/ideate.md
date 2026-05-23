# IDEATE: Project Initialization & Requirements Gathering

**Purpose:** Transform raw ideas, feature requests, or bug reports into structured requirements ready for technical design.

**When to use:**
- 🆕 **CREATE** - Starting a new project from scratch (greenfield)
- ✨ **EVOLVE** - Adding features to an existing codebase (brownfield enhancement)
- 🐛 **MAINTAIN** - Fixing bugs or addressing technical debt (brownfield maintenance)
- 🔧 **REFACTOR** - Structural improvements or architecture changes

---

## Process Overview

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────────┐
│   IDEATE    │────→│  create-prd  │────→│ create-tdd   │────→│create-issues│
│  (you are   │     │              │     │              │     │             │
│   here)     │     │              │     │              │     │             │
└─────────────┘     └──────────────┘     └──────────────┘     └─────────────┘
      │
      │ Produces: problem-statement.md (optional) OR direct PRD input
      │
      └──→  create-prd.md (WHAT to build)
           └──→  create-tdd.md (HOW to build)
                └──→  create-issues.md (WHO does what)
                     └──→  execute-issues.md (parallel execution)
                          └──→  first-run-qa.md (systematic verification)
```

---

## Decision Tree: Which Path Are You On?

### 🆕 CREATE (Greenfield Project)

**Indicators:**
- Starting from an empty repository
- No existing codebase constraints
- Full architectural freedom

**Path:**
1. Use this document's **Interactive Requirements Gathering** (Section 3)
2. Document answers in `problem-statement.md` (Section 4)
3. Proceed to `create-prd.md` with your problem statement

**Key Consideration:** You have maximum flexibility but must define everything from scratch (tech stack, architecture, patterns).

---

### ✨ EVOLVE (Feature Addition)

**Indicators:**
- Adding new functionality to existing code
- Need to integrate with current architecture
- Existing patterns and conventions to follow

**Path:**
1. Use **Brownfield Feature Questions** (Section 5)
2. Read existing code to understand patterns
3. Document integration points in `feature-proposal.md`
4. Proceed to `create-prd.md` (which will reference existing architecture)
5. `create-tdd.md` will include **mandatory codebase assessment**

**Key Consideration:** New features must fit existing patterns unless you explicitly decide to refactor (which becomes its own workstream).

---

### 🐛 MAINTAIN (Bug Fix or Tech Debt)

**Indicators:**
- Existing behavior is broken or suboptimal
- Performance issues or security vulnerabilities
- Code quality improvements (linting, testing, refactoring)

**Path:**
1. Use **Bug Triage Questions** (Section 6)
2. Document root cause in `bug-analysis.md`
3. Small fixes: Skip directly to implementation (no PRD/TDD needed)
4. Large fixes: Proceed to `create-prd.md` → `create-tdd.md`

**Threshold for PRD/TDD:**
- **Skip process:** Single-file changes, <50 lines modified, obvious fix
- **Use process:** Multi-file changes, architectural impact, risk of regression

**Key Consideration:** Maintain existing patterns unless the bug reveals systemic design flaws (then consider REFACTOR).

---

### 🔧 REFACTOR (Structural Improvement)

**Indicators:**
- Architecture changes (e.g., monolith → microservices)
- Technology migration (e.g., JavaScript → TypeScript)
- Pattern unification (e.g., consolidating API clients)

**Path:**
1. Use **Refactoring Assessment** (Section 7)
2. Document current state + target state in `refactoring-plan.md`
3. **Always use PRD/TDD/Issues** - refactoring is high-risk
4. Break into phases (each phase = separate PR)

**Key Consideration:** Refactoring should maintain external behavior. If you're also changing functionality, split into two workstreams.

---

## 3. Interactive Requirements Gathering (CREATE)

**Goal:** Extract structured requirements through Q&A when starting from a vague idea.

**Inspiration:** Agent OS `spec-shaper` process (Brian Casel, Builder Methods)

### Round 1: Core Problem

Ask yourself (or stakeholders):

1. **What problem are we solving?**
   - Who experiences this problem?
   - What's the cost of not solving it?
   - What evidence do we have that this is worth solving?

2. **What does success look like?**
   - Quantitative metrics (e.g., "reduce query time from 5s to <1s")
   - Qualitative goals (e.g., "users can schedule meetings without leaving Claude")

3. **Who are the users?**
   - Primary users (who uses this daily?)
   - Secondary users (who benefits indirectly?)
   - Admin users (who manages/configures this?)

### Round 2: Scope & Constraints

4. **What's in scope for MVP?**
   - Core features (must-have)
   - Excluded features (explicitly out of scope)
   - Future enhancements (nice-to-have, but not now)

5. **What are the constraints?**
   - Technical (e.g., "must run on Cloudflare Workers")
   - Budget (e.g., "free tier only")
   - Timeline (e.g., "ship by March 15" or "no fixed deadline")
   - Legal/compliance (e.g., "GDPR compliant")

6. **What are the risks?**
   - Technical risks (e.g., "API rate limits may block scaling")
   - User adoption risks (e.g., "OAuth flow too complex")
   - Maintenance risks (e.g., "requires manual secret rotation")

### Round 3: Visual Assets (if applicable)

7. **Do we need mockups, diagrams, or screenshots?**
   - UI mockups (for user-facing features)
   - Architecture diagrams (for system design)
   - Data flow diagrams (for complex transformations)

8. **Where should visual assets live?**
   - Recommendation: `docs/visuals/` with subdirectories by category
   - Example: `docs/visuals/ui/`, `docs/visuals/architecture/`

### Round 4: Dependencies & Integration

9. **What existing systems do we integrate with?**
   - External APIs (e.g., Google Calendar API)
   - Internal services (e.g., authentication provider)
   - Data sources (e.g., databases, KV stores)

10. **What standards or conventions must we follow?**
    - Company coding standards
    - Industry standards (e.g., OAuth 2.0, REST API design)
    - Existing project patterns (for EVOLVE scenarios)

---

## 4. Problem Statement Template (CREATE Output)

After answering the questions above, create `problem-statement.md`:

```markdown
# Problem Statement: [Project Name]

## Metadata
- **Author:** [Your name]
- **Date:** [YYYY-MM-DD]
- **Type:** CREATE (Greenfield)
- **Status:** Draft

## 1. The Problem

[2-3 sentences describing the problem]

**Who experiences it:** [User personas]

**Cost of not solving:** [Business impact or user pain]

**Evidence:** [Data, user feedback, support tickets, or intuition]

## 2. Success Criteria

**Quantitative:**
- [Metric 1: e.g., "API response time <2s for 95% of requests"]
- [Metric 2: e.g., "Support zero users simultaneously"]

**Qualitative:**
- [Goal 1: e.g., "Users can complete OAuth without external documentation"]
- [Goal 2: e.g., "Developers can deploy in <30 minutes"]

## 3. Scope

**MVP (Must-Have):**
- [Feature 1]
- [Feature 2]

**Excluded (Explicitly Out of Scope):**
- [Non-feature 1]
- [Non-feature 2]

**Future Enhancements:**
- [Nice-to-have 1]
- [Nice-to-have 2]

## 4. Constraints

- **Technical:** [e.g., "Must run on Cloudflare Workers (50ms CPU budget)"]
- **Budget:** [e.g., "Free tier only (no paid services)"]
- **Timeline:** [e.g., "No fixed deadline" or "Ship by March 15, 2026"]
- **Compliance:** [e.g., "GDPR-compliant token storage"]

## 5. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| [Risk 1] | [Low/Med/High] | [Low/Med/High] | [Strategy] |
| [Risk 2] | [Low/Med/High] | [Low/Med/High] | [Strategy] |

## 6. Dependencies

**External Systems:**
- [API 1: e.g., "Google Calendar API (OAuth 2.0)"]
- [Service 2: e.g., "Cloudflare KV (token storage)"]

**Internal Systems:**
- [If any]

## 7. Visual Assets

**Required:**
- [Architecture diagram showing Worker + KV + Google API]
- [If UI: Mockups in docs/visuals/ui/]

**Location:** `docs/visuals/`

## 8. Next Steps

1. Review this problem statement with stakeholders
2. Get approval on scope and constraints
3. Proceed to `process/create-prd.md` to formalize requirements
```

**Output:** `problem-statement.md` in project root or `docs/`

**Next Step:** Use this as input to `process/create-prd.md`

---

## 5. Brownfield Feature Questions (EVOLVE)

**Goal:** Understand existing codebase before proposing new features.

### Codebase Assessment

1. **What is the current architecture?**
   - Read `docs/architecture.md` or similar
   - Identify key modules/components
   - Understand data flow

2. **What patterns are established?**
   - Coding style (linting config, naming conventions)
   - Test patterns (unit vs. integration, mocking strategies)
   - API design (REST conventions, error handling)
   - Deployment (CI/CD pipelines, environment management)

3. **Where does this feature fit?**
   - Which module/component should own it?
   - Does it integrate with existing features?
   - Are there domain boundaries to respect?

### Integration Planning

4. **What existing code must change?**
   - Files to modify (list specific paths)
   - Interfaces to extend
   - Database schemas to migrate

5. **What new code is needed?**
   - New files (follow existing structure)
   - New dependencies (justify each)
   - New configuration (env vars, secrets)

6. **What tests are affected?**
   - Existing tests that need updates
   - New tests required
   - Regression risk (what could break?)

### Output: Feature Proposal

Create `feature-proposal.md`:

```markdown
# Feature Proposal: [Feature Name]

## Metadata
- **Author:** [Your name]
- **Date:** [YYYY-MM-DD]
- **Type:** EVOLVE (Brownfield Feature)
- **Status:** Draft

## 1. Feature Description

[What are we adding?]

## 2. Integration Points

**Existing Modules Affected:**
- `src/module-a.ts` - [What changes]
- `src/module-b.ts` - [What changes]

**New Modules:**
- `src/feature-x.ts` - [Purpose]

## 3. Pattern Compliance

**Coding Style:** [Follows existing linter config: yes/no]

**Test Pattern:** [Matches existing test structure: yes/no]

**API Design:** [Consistent with current API conventions: yes/no]

## 4. Risk Assessment

**Regression Risk:** [Low/Med/High]

**Breaking Changes:** [Yes/No - if yes, explain mitigation]

## 5. Next Steps

1. Get architectural approval
2. Proceed to `process/create-prd.md` (reference this proposal)
3. TDD must include **codebase assessment section**
```

**Output:** `feature-proposal.md`

**Next Step:** Proceed to `create-prd.md` → `create-tdd.md` (with codebase assessment)

---

## 6. Bug Triage Questions (MAINTAIN)

**Goal:** Determine if bug requires full process or quick fix.

### Triage Checklist

1. **What is broken?**
   - Observable symptom (what users see)
   - Expected behavior (what should happen)
   - Actual behavior (what actually happens)

2. **What's the root cause?**
   - Hypothesis (what do you think is wrong?)
   - Evidence (logs, stack traces, reproduction steps)
   - Confidence (certain, probable, or investigating?)

3. **What's the scope of the fix?**
   - **Localized:** Single file, <50 lines, obvious fix → **Skip process, fix directly**
   - **Moderate:** Multi-file, requires tests, some design → **Use lightweight PRD**
   - **Systemic:** Architectural flaw, widespread impact → **Use full process (PRD/TDD/Issues)**

### Output: Bug Analysis (for Moderate/Systemic)

Create `bug-analysis.md`:

```markdown
# Bug Analysis: [Bug Title]

## Metadata
- **Author:** [Your name]
- **Date:** [YYYY-MM-DD]
- **Type:** MAINTAIN (Bug Fix)
- **Severity:** [Critical/High/Medium/Low]
- **Scope:** [Localized/Moderate/Systemic]

## 1. Symptoms

**What users see:**
[Describe observable problem]

**Expected behavior:**
[What should happen]

**Actual behavior:**
[What actually happens]

## 2. Root Cause

**Hypothesis:**
[What you think is wrong]

**Evidence:**
- [Log excerpt]
- [Stack trace]
- [Reproduction steps]

**Confidence:** [Certain/Probable/Investigating]

## 3. Proposed Fix

**Files to modify:**
- [file-a.ts: line 123 - change X to Y]
- [file-b.ts: add validation]

**Tests to add:**
- [Regression test for reproduction case]
- [Edge case coverage if applicable]

## 4. Risk Assessment

**Regression risk:** [Low/Med/High]

**User impact if bug unfixed:** [e.g., "Blocks all users from login"]

**User impact if fix is wrong:** [e.g., "Could corrupt existing data"]

## 5. Decision

- [ ] **Fix directly** (localized, low risk)
- [ ] **Use PRD/TDD/Issues** (moderate/systemic, high risk)

## 6. Next Steps

[If using process: Proceed to create-prd.md]
[If fixing directly: Create PR with test coverage]
```

**Output:** `bug-analysis.md`

**Next Step:**
- **Localized:** Fix directly, write regression test, create PR
- **Moderate/Systemic:** Proceed to `create-prd.md`

---

## 7. Refactoring Assessment (REFACTOR)

**Goal:** Plan structural improvements without changing external behavior.

### Assessment Questions

1. **What's the current pain point?**
   - Performance issues
   - Maintenance burden (code duplication, complexity)
   - Scalability limits
   - Technical debt (outdated dependencies, security vulnerabilities)

2. **What's the target state?**
   - Desired architecture
   - Technology migration (if any)
   - Pattern unification

3. **What must remain unchanged?**
   - External APIs (if refactoring backend)
   - User-facing behavior (if refactoring UI)
   - Data integrity (if refactoring storage)

### Phasing Strategy

**Rule:** Refactoring is high-risk. Always break into phases.

**Phase sizing:**
- Each phase = shippable, testable increment
- Each phase = separate PR
- Each phase = maintains external behavior

**Example: Monolith → Microservices**
- Phase 1: Extract auth service (no API changes)
- Phase 2: Extract user service
- Phase 3: Extract billing service
- Phase 4: Retire monolith

### Output: Refactoring Plan

Create `refactoring-plan.md`:

```markdown
# Refactoring Plan: [Title]

## Metadata
- **Author:** [Your name]
- **Date:** [YYYY-MM-DD]
- **Type:** REFACTOR (Structural Improvement)
- **Status:** Draft

## 1. Current State

**Pain Point:**
[What's broken or suboptimal?]

**Evidence:**
- [Metrics: e.g., "Query time: 5s avg"]
- [Developer feedback: e.g., "Adding features takes 3x longer than expected"]

## 2. Target State

**Desired Architecture:**
[Describe end state]

**Why this improves things:**
[Specific benefits - performance, maintainability, scalability]

## 3. External Behavior (Must Preserve)

- [ ] **API contracts unchanged** (or versioned with backward compatibility)
- [ ] **User-facing behavior unchanged**
- [ ] **Data integrity maintained** (migrations tested)
- [ ] **Performance does not degrade**

## 4. Phases

### Phase 1: [Title]
**Goal:** [What gets refactored]

**Changes:**
- [Specific file/module changes]

**Tests:**
- [How we validate no regressions]

**Shippable:** [Yes/No - can deploy this phase independently?]

### Phase 2: [Title]
[Repeat structure]

## 5. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| [Risk 1] | [Strategy] |
| [Risk 2] | [Strategy] |

## 6. Rollback Plan

**If Phase X fails:**
1. [Rollback steps]
2. [Monitoring to detect failure]

## 7. Next Steps

1. Get architectural approval for full plan
2. Create PRD for Phase 1 only
3. Ship Phase 1 → validate → proceed to Phase 2
```

**Output:** `refactoring-plan.md`

**Next Step:** Create PRD/TDD/Issues **for Phase 1 only**. Ship, validate, then repeat for subsequent phases.

---

## 8. Visual Assets Management

**Inspired by:** Agent OS visual asset organization (Brian Casel, Builder Methods)

### Directory Structure

```
docs/
├── visuals/
│   ├── architecture/       # System diagrams, data flow
│   ├── ui/                 # Mockups, wireframes
│   ├── oauth/              # OAuth flow screenshots (QA evidence)
│   ├── verification/       # Test screenshots, visual regression baselines
│   └── diagrams/           # Mermaid source files (.mmd)
```

### When to Create Visual Assets

**Architecture Diagrams (ALWAYS):**
- System architecture (components, data flow)
- Deployment architecture (Cloudflare Workers, KV, external APIs)

**UI Mockups (IF APPLICABLE):**
- User-facing features (web UI, CLI output)
- OAuth consent screens
- Error messages and notifications

**Screenshots (FOR QA):**
- OAuth flows (evidence of correct rendering)
- Visual regression testing (before/after comparisons)

### Tools

**Diagrams:**
- Mermaid (`.mmd` files in `docs/diagrams/`, rendered in markdown)
- Excalidraw (for hand-drawn style)

**UI Mockups:**
- Figma (export to PNG/SVG)
- Balsamiq (wireframes)

**Screenshots:**
- Playwright (automated capture during QA)
- Manual capture (browser dev tools)

---

## 9. Standards & Conventions

**Reference:** `process/standards/` directory

Before proceeding to PRD/TDD, review applicable standards:

- **Always:** `standards/global/coding-style.md`, `standards/global/error-handling.md`
- **If building APIs:** `standards/backend/api.md`
- **If building UI:** `standards/frontend/components.md`
- **If writing tests:** `standards/testing/test-writing.md`

**Attribution:** Standards adapted from Agent OS by Brian Casel (Builder Methods). See `process/standards/ATTRIBUTION.md` for details.

---

## 10. Checklist: Ready to Proceed?

Before moving to `create-prd.md`, ensure you have:

### For CREATE (Greenfield):
- [ ] Completed Interactive Requirements Gathering (Section 3)
- [ ] Created `problem-statement.md` (Section 4)
- [ ] Identified visual assets needed (Section 8)
- [ ] Reviewed applicable standards (Section 9)

### For EVOLVE (Brownfield Feature):
- [ ] Completed Brownfield Feature Questions (Section 5)
- [ ] Created `feature-proposal.md`
- [ ] Identified integration points with existing code
- [ ] Assessed regression risk

### For MAINTAIN (Bug Fix):
- [ ] Completed Bug Triage (Section 6)
- [ ] Created `bug-analysis.md` (if moderate/systemic)
- [ ] Determined if full process is needed (skip for localized fixes)

### For REFACTOR (Structural Change):
- [ ] Completed Refactoring Assessment (Section 7)
- [ ] Created `refactoring-plan.md`
- [ ] Broken work into phases
- [ ] Identified rollback plan

---

## 11. Next Steps

**All paths lead to:**

```
process/create-prd.md
```

**What to bring:**
- Your ideation output (`problem-statement.md`, `feature-proposal.md`, etc.)
- Visual assets (if created)
- Codebase assessment (for EVOLVE/MAINTAIN/REFACTOR)

**What `create-prd.md` will produce:**
- Formal Product Requirements Document
- Functional requirements (FR-001, FR-002, etc.)
- Acceptance criteria
- Non-goals
- Success metrics

**After PRD:**
- `create-tdd.md` (technical design)
- `create-issues.md` (task decomposition)
- `execute-issues.md` (parallel implementation)
- `first-run-qa.md` (systematic verification)

---

## Attribution

**Process Design:** Sense and Motion, Vancouver BC (Geoff)

**Influences:**
- **Agent OS:** Interactive requirements gathering, visual asset management, standards library
  - Creator: Brian Casel @ Builder Methods
  - Website: https://buildermethods.com/agent-os
  - Used with inspiration and attribution

**License:** MIT (see project LICENSE file)

---

*Last Updated: 2026-02-16*
