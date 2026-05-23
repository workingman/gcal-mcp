# Process Enhancements - February 2026

## Overview

This document summarizes enhancements made to the Sense and Motion development process by integrating best practices from Agent OS (Brian Casel, Builder Methods).

**Date:** 2026-02-16
**Motivation:** Close gaps identified in Agent OS comparison while maintaining our core strengths (dependency-aware parallelization, GitHub integration, context optimization).

---

## What Was Added

### 1. IDEATE Entry Point ⭐ **NEW**

**File:** `process/ideate.md`

**Purpose:** Structured requirements gathering that handles four distinct scenarios:
- 🆕 **CREATE** - Greenfield projects (new codebases)
- ✨ **EVOLVE** - Brownfield features (adding to existing code)
- 🐛 **MAINTAIN** - Bug fixes and tech debt
- 🔧 **REFACTOR** - Structural improvements

**Key Features:**
- Interactive requirements gathering (inspired by Agent OS `spec-shaper`)
- Decision tree guiding which path to take
- Output templates (problem-statement.md, feature-proposal.md, bug-analysis.md)
- Visual assets management guidance
- Clear "next steps" leading to create-prd.md

**Why This Matters:**
Previously, we jumped straight to PRD creation. Now we have structured upfront work that clarifies requirements before technical design begins.

---

### 2. Comprehensive Standards Library ⭐ **NEW**

**Location:** `process/standards/`

**Contents:**
- `ATTRIBUTION.md` - Credit to Agent OS with detailed comparison
- `README.md` - Standards overview and usage guide
- `global/coding-style.md` - Naming, formatting, DRY principles
- `global/error-handling.md` - User-friendly errors, retry strategies
- `global/conventions.md` - Git commits, documentation, env vars
- `backend/api.md` - REST API design, versioning, HTTP status codes
- `testing/test-writing.md` - Test strategy, coverage, Playwright

**Modifications from Agent OS:**
- ✅ Adapted for GitHub-native workflow (not markdown task files)
- ✅ Modified test philosophy: per-issue coverage for parallel safety
- ✅ Added TypeScript-specific guidance
- ✅ Added context optimization patterns (our innovation)

**Progressive Disclosure:**
Standards are loaded per-task, not all at once. GitHub issues reference applicable standards:
```markdown
## Applicable Standards
- process/standards/global/coding-style.md
- process/standards/backend/api.md
```

---

### 3. Visual Debugging Integration ⭐ **ENHANCED**

**File:** `process/first-run-qa.md` (RENDER layer)

**What Changed:**
- Added Playwright automated screenshot capture
- OAuth flow visual verification
- Visual regression testing patterns
- Screenshot storage organization (`docs/visuals/`)

**Before:**
```
RENDER: Manual visual inspection only
```

**After:**
```
RENDER: Manual inspection + Playwright automation
- Auto-capture OAuth screens for QA evidence
- Visual regression testing (before/after comparison)
- Browser compatibility testing
```

**Benefits:**
- Reproducible visual verification
- Evidence for compliance/audit
- Catch UI regressions early

---

### 4. Enhanced Process README ⭐ **ENHANCED**

**File:** `process/README.md`

**Changes:**
- **IDEATE prominently featured** as starting point
- Pipeline diagram updated to show full flow
- Process files table with "When to Use" column
- Standards library section added
- Clear entry points for CREATE, EVOLVE, MAINTAIN, REFACTOR

**Before:**
```
Pipeline: create-prd → create-tdd → create-issues
```

**After:**
```
Pipeline: IDEATE → create-prd → create-tdd → create-issues → execute-issues → first-run-qa
           ↑
     (start here!)
```

---

## Gaps Closed (from Agent OS Comparison)

| Gap | Status | Implementation |
|-----|--------|----------------|
| **Standards Library** | ✅ **CLOSED** | Created `process/standards/` with 7 standards files |
| **Interactive Requirements Gathering** | ✅ **CLOSED** | Created `process/ideate.md` with Q&A flows |
| **Visual Debugging** | ✅ **CLOSED** | Integrated Playwright in `first-run-qa.md` |
| **Visual Assets Support** | ✅ **CLOSED** | Covered in `ideate.md` Section 8 |
| **Subagent Specialization** | 🔬 **RESEARCH** | Deferred - requires empirical validation |

---

## What We Kept (Our Core Strengths)

### 1. Dependency-Aware Parallelization
- GitHub issue dependencies (blocks/blocked-by)
- Automatic wave-based execution
- 30-50% speedup validated (calendar-mcp project)

### 2. Context Optimization
- TDD excerpt extraction (~6K token savings)
- Checkpoint protocols for graceful degradation
- Rate-limit conscious issue updates

### 3. GitHub-Native Workflow
- Issues as source of truth (not markdown files)
- Commit-per-issue discipline
- Cross-team visibility

### 4. Systematic QA
- 5-layer testing (BUILD → BOOT → RENDER → FUNCTION → POLISH)
- External state tracking (qa-state.md, qa-findings.md)
- Fallback protocol for failures

---

## Attribution & Philosophy

**Our Process:**
- Optimized for speed (parallel execution)
- GitHub-centric (issues, dependencies, commits)
- Context-efficient (TDD excerpts, checkpoints)

**Agent OS:**
- Optimized for flexibility (tool-agnostic)
- Comprehensive standards library
- Interactive requirements gathering
- Visual verification practices

**Hybrid Approach:**
- Use **Agent OS requirements gathering** → produce our PRD
- Use **our orchestrator** → parallel implementation
- Use **Agent OS standards** → during development
- Use **Agent OS visual testing** → during QA

**Result:** Best of both systems. Flexibility where it matters (ideation, standards), speed where it matters (execution).

---

## Usage Examples

### Starting a New Project (CREATE)
```bash
# 1. Start with ideation
Read: process/ideate.md (Section 3: Interactive Requirements Gathering)
Output: problem-statement.md

# 2. Create PRD
Use: process/create-prd.md
Input: problem-statement.md
Output: docs/prd-{project}.md

# 3. Create TDD
Use: process/create-tdd.md
Input: docs/prd-{project}.md
Output: docs/tdd-{project}.md

# 4. Create Issues
Use: process/create-issues.md
Input: PRD + TDD
Output: 63 GitHub issues with dependencies

# 5. Execute
Use: process/execute-issues.md
Output: 6 agents implement 63 issues in ~7 hours

# 6. QA
Use: process/first-run-qa.md
Output: Production-ready software
```

### Adding a Feature (EVOLVE)
```bash
# 1. Assess integration
Read: process/ideate.md (Section 5: Brownfield Feature Questions)
Output: feature-proposal.md

# 2. Follow standard pipeline
PRD → TDD (with codebase assessment) → Issues → Execute → QA
```

### Fixing a Bug (MAINTAIN)
```bash
# 1. Triage
Read: process/ideate.md (Section 6: Bug Triage Questions)

# 2a. If localized: Fix directly (no process)
# 2b. If systemic: Follow full pipeline
Output: bug-analysis.md → PRD → TDD → Issues → Execute → QA
```

---

## Metrics & Validation

### Calendar MCP Project (Validation Case)
- **Process:** CREATE → PRD → TDD → 63 Issues → Execute (6 agents) → QA
- **Time:** ~7 active hours (13.6 elapsed with gap)
- **Output:** Production-ready MCP server
- **Coverage:** 298 tests, 90.71%
- **Parallelization:** 30-50% speedup (validated)
- **Agent autonomy:** 0 manual interventions during execution

**Key Learnings:**
1. Orchestrator-driven context management works (0 interventions)
2. Mandatory issue closing language prevents hallucinations
3. Sequential validation before parallelization catches process bugs early

---

## Future Enhancements

### Short-Term (Next Project)
1. **Visual assets templates** - Mermaid diagram templates in `process/templates/`
2. **Playwright config** - Pre-configured `playwright.config.ts` template
3. **Standards checklist** - Quick-reference card for agents

### Medium-Term (3-6 months)
1. **Frontend standards** - Complete `process/standards/frontend/` (components.md, responsive.md, accessibility.md)
2. **Database standards** - Complete `process/standards/backend/models.md`, `migrations.md`
3. **EVOLVE validation** - Test brownfield feature addition with this process

### Research
1. **Subagent specialization** - Does manual specialist assignment improve quality?
2. **Cross-tool compatibility** - Can Cursor/Windsurf use this process?
3. **Larger context budgets** - Push agents to 120k-140k tokens safely

---

## Credits

**Process Design:** Sense and Motion, Vancouver BC (Geoff)

**Agent OS Influences:**
- Interactive requirements gathering
- Visual asset management
- Comprehensive standards library
- Visual verification with Playwright

**Agent OS Creator:** Brian Casel @ Builder Methods
- Website: https://buildermethods.com/agent-os
- Philosophy: Structured, tool-agnostic agentic development

**License:** MIT (see project LICENSE file)

---

## Comparison Summary

| Aspect | Before | After |
|--------|--------|-------|
| **Entry point** | create-prd.md | ideate.md (CREATE/EVOLVE/MAINTAIN/REFACTOR) |
| **Standards** | Basic (1 file) | Comprehensive (7 files) |
| **Visual testing** | Manual only | Manual + Playwright |
| **Requirements** | Ad-hoc | Structured Q&A |
| **Attribution** | N/A | Agent OS credited |
| **Brownfield** | Implicit | Explicit (EVOLVE, MAINTAIN paths) |

---

## References

- **Agent OS:** https://buildermethods.com/agent-os
- **Our Process:** `process/README.md`
- **Detailed Comparison:** `/Users/sam/dev/codex-calendar-mcp/agent-os-comparison.md`
- **Validation Project:** calendar-mcp (this repository)

---

*Last Updated: 2026-02-16*
*This enhancement represents the synthesis of two mature agentic development systems.*
