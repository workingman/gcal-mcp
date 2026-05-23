# Development Process Comparison: Sense and Motion Process vs. Agent OS

**Date:** February 2026
**Version:** 1.0

## Executive Summary

This document compares two structured approaches to AI-assisted software development:

- **Sense and Motion Process** - Our GitHub-integrated, dependency-aware development workflow
- **Agent OS** - Brian Casel's spec-driven agentic development system

Both systems transform AI coding agents from "confused interns into productive developers" through structured workflows. They differ primarily in their optimization targets: **flexibility vs. efficiency**, **local files vs. GitHub integration**, and **manual control vs. automated parallelization**.

---

## System Overviews

### Sense and Motion Process

**Philosophy:** Issue-driven development with dependency-aware parallelization

**Key Components:**
- Product Requirements Document (PRD)
- Technical Design Document (TDD)
- GitHub Issues with encoded dependencies
- Parallel execution orchestrator
- Layer-based QA system (BUILD → BOOT → RENDER → INTERACT)

**Workflow:**
```
Ideation → create-prd → create-tdd → create-issues (with dependencies)
  → execute-issues (parallel waves) → first-run-qa (layer-based)
```

**Target Users:** Teams using Claude Code + GitHub, optimizing for speed and traceability

---

### Agent OS

**Philosophy:** Spec-driven development with flexible tool integration

**Key Components:**
- Product planning (mission, roadmap, tech stack)
- Interactive spec shaping with Q&A
- Formal specification documents
- Task breakdown with markdown checklists
- Subagent orchestration system

**Workflow:**
```
/plan-product → /shape-spec (interactive Q&A) → /write-spec
  → /create-tasks → /implement-tasks or /orchestrate-tasks → verification
```

**Target Users:** Developers using any AI tool (Claude Code, Cursor, Windsurf), valuing flexibility and documentation

---

## Detailed Comparison

### 1. Requirements Gathering

| Aspect | Sense and Motion | Agent OS |
|--------|------------------|----------|
| **Approach** | PRD/TDD written by humans upfront | Interactive Q&A process (`spec-shaper`) |
| **Visual assets** | Not formalized | Dedicated `/planning/visuals/` folder |
| **Stakeholder interaction** | Manual | Structured question rounds |
| **Product planning** | Manual | Automated (`/plan-product` command) |

**Winner: Agent OS** - Better onboarding for teams without existing specs, structured requirements gathering

**Gap to close:** Add interactive requirements gathering for greenfield, EVOLVE (features), and MAINTAIN (bugs)

---

### 2. Dependency Management & Parallelization

| Aspect | Sense and Motion | Agent OS |
|--------|------------------|----------|
| **Dependency encoding** | GitHub issue dependencies (GraphQL API) | Manual in task breakdown |
| **Execution strategy** | Automatic wave-based parallelization | Manual subagent assignment |
| **Speedup** | 30-50% for well-decomposed work | Sequential per task group |
| **Coordination** | Git-based with domain boundaries | Markdown checkbox updates |

**Winner: Sense and Motion** - Automatic parallelization based on file/interface dependencies

**Their gap:** No encoded dependencies, sequential execution unless manually orchestrated

---

### 3. Traceability & Progress Tracking

| Aspect | Sense and Motion | Agent OS |
|--------|------------------|----------|
| **Source of truth** | GitHub Issues | Markdown files (`tasks.md`) |
| **Progress visibility** | GitHub UI + issue status | Checkbox states in markdown |
| **Commit discipline** | Issue-per-commit with `#<number>` | Commit messages reference tasks |
| **Team coordination** | GitHub project boards | Local file updates |
| **History** | Git + GitHub Issues | Git commit messages |

**Winner: Sense and Motion** - Better for distributed teams, GitHub ecosystem integration

**Their gap:** Harder to visualize progress across team without external tooling

---

### 4. Context Optimization

| Aspect | Sense and Motion | Agent OS |
|--------|------------------|----------|
| **Document size** | TDD excerpts (~6K token savings) | Full spec.md + requirements.md |
| **Checkpoint protocol** | Yes - graceful degradation | Not formalized |
| **Issue updates** | Minimal (rate limit conscious) | Per-task checkbox updates |
| **Context reuse** | Dependency graph computed once | Spec read every execution |

**Winner: Sense and Motion** - Better context efficiency for long-running projects

**Their gap:** Full spec re-reading adds token overhead

---

### 5. Quality Assurance

| Aspect | Sense and Motion | Agent OS |
|--------|------------------|----------|
| **QA approach** | Layer-based (BUILD/BOOT/RENDER/INTERACT) | End-of-feature verification |
| **Testing integration** | Per-issue test requirements | Self-verification + test writing |
| **Browser testing** | Not integrated | Playwright MCP support |
| **Visual verification** | Not formalized | Screenshots in `/verification/` |
| **Fallback protocol** | If layer fails → file issue → fix → retry | Pass/fail report |

**Winner: Mixed**
- **Sense and Motion:** Systematic layer-based approach
- **Agent OS:** Better UI testing with Playwright + screenshots

**Gap to close:** Add visual debugging capability (Playwright integration)

---

### 6. Standards & Conventions

| Aspect | Sense and Motion | Agent OS |
|--------|------------------|----------|
| **Standards library** | Basic (docs/standards/general.md) | Comprehensive templates |
| **Organization** | Skills + docs folder | `/standards/` hierarchy |
| **Coverage** | General coding standards | Frontend, backend, testing, global |
| **Customization** | Manual editing | Template-based |

**Winner: Agent OS** - More comprehensive out-of-box standards

**Gap to close:** Build standards library (coding style, API design, testing patterns)

---

### 7. Tool Integration & Flexibility

| Aspect | Sense and Motion | Agent OS |
|--------|------------------|----------|
| **Tool support** | Claude Code native | Any tool (Cursor, Windsurf, etc.) |
| **Installation** | Manual process setup | `project-install.sh` script |
| **Adoption curve** | All-or-nothing workflow | Gradual (`/implement-tasks` only) |
| **MCP integrations** | Not specified | Playwright, IDE diagnostics |

**Winner: Agent OS** - Tool-agnostic, easier gradual adoption

**Their gap:** Less deep integration with any single tool

---

### 8. Brownfield Support (Existing Codebases)

| Aspect | Sense and Motion | Agent OS |
|--------|------------------|----------|
| **Design intent** | Planned MAINTAIN/EVOLVE layers | Greenfield-focused |
| **Bug fixes** | Planned MAINTAIN workflow | General implementation flow |
| **Feature additions** | Planned EVOLVE workflow | `/shape-spec` for new features |
| **Codebase analysis** | Domain boundary detection | Pattern analysis in implementer |

**Winner: Sense and Motion** - Explicit brownfield workflows in roadmap

**Gap to close:** Implement MAINTAIN and EVOLVE layers with requirements gathering

---

## Where Each System Excels

### Agent OS Strengths

1. **Onboarding & Adoption**
   - Pre-built standards library
   - Gradual adoption (use parts without committing to full workflow)
   - Tool-agnostic (works with any IDE)
   - Interactive requirements gathering

2. **Requirements Gathering**
   - Structured Q&A with stakeholders
   - Visual asset management (mockups, screenshots)
   - Product-level planning automation

3. **UI Testing**
   - Playwright integration for browser testing
   - Screenshot capture and verification
   - Visual regression testing

4. **Flexibility**
   - Manual subagent selection
   - Task cherry-picking (implement subset)
   - Works with any tool ecosystem

---

### Sense and Motion Process Strengths

1. **Efficiency & Parallelization**
   - Dependency analysis at creation time
   - Automatic wave-based execution
   - 30-50% speedup for decomposed work
   - Git-based parallel agent coordination

2. **Traceability**
   - GitHub Issues as source of truth
   - Commit-per-issue discipline
   - Cross-team visibility
   - Dependency graph in GitHub UI

3. **Context Optimization**
   - TDD excerpt extraction (~6K token savings)
   - Checkpoint protocol for graceful degradation
   - Rate-limit conscious issue updates

4. **Systematic QA**
   - Layer-based testing (BUILD → BOOT → RENDER → INTERACT)
   - External QA state tracking
   - Fallback protocol for failures

5. **Team Scaling**
   - Explicit domain boundaries
   - Git isolation protocol
   - Parallel agent safety

---

## Decision Matrix: When to Use Which?

### Choose Agent OS if you:

- ✅ Want maximum flexibility (work with any tool, not just Claude Code)
- ✅ Need interactive requirements gathering (Q&A with stakeholders)
- ✅ Have design-heavy features (mockups, visual assets central)
- ✅ Want to customize standards templates
- ✅ Prefer local markdown files over GitHub integration
- ✅ Want manual control over which specialist handles which task
- ✅ Need UI testing with screenshots (Playwright)
- ✅ Are starting fresh and want guided onboarding

### Choose Sense and Motion Process if you:

- ✅ Use Claude Code + GitHub exclusively
- ✅ Want maximum parallelization (30-50% faster for decomposed work)
- ✅ Need traceability across distributed teams (GitHub as source of truth)
- ✅ Have clear requirements upfront (PRD/TDD written by humans)
- ✅ Want automated dependency-driven execution
- ✅ Need structured QA with layer-based testing
- ✅ Plan to work on brownfield codebases (MAINTENANCE/EVOLVE)
- ✅ Optimize for token efficiency in long-running projects

---

## Gaps We're Closing

Based on this comparison, we're adding to our roadmap:

### High Priority
1. **Standards library** - Comprehensive templates (coding style, API design, testing)
2. **Interactive requirements gathering** - Q&A process for greenfield, EVOLVE (features), MAINTAIN (bugs)
3. **Visual debugging** - Playwright integration for UI testing with screenshots

### Medium Priority
4. **Visual assets support** - Mockups/screenshots integration (nice to have)
5. **Evaluate subagent specialization** - Research if manual assignment improves quality

---

## Hybrid Opportunities

### What we could adopt from Agent OS:
1. Interactive requirements gathering (spec-shaper style)
2. Visual asset management (dedicated folders)
3. Browser testing integration (Playwright MCP)
4. Verification screenshots for UI features

### What Agent OS could adopt from us:
1. GitHub issue dependencies for parallelization
2. TDD excerpt optimization (context efficiency)
3. Layer-based QA (BUILD/BOOT/RENDER)
4. Checkpoint protocol for context degradation

---

## Conclusion

Both systems are mature, well-designed approaches to AI-assisted development. The choice depends on your team's priorities:

- **Agent OS:** Maximize flexibility, documentation quality, and tool independence
- **Sense and Motion Process:** Maximize efficiency, traceability, and parallel execution

For teams deeply invested in the GitHub ecosystem using Claude Code, our process delivers significant speed advantages (30-50%) through automatic parallelization. For teams wanting flexibility across tools or needing rich documentation workflows, Agent OS provides better onboarding and requirements gathering.

The systems are complementary rather than competing - teams could use Agent OS's requirements gathering to produce our PRD/TDD, then execute with our dependency-aware orchestrator.

---

## References

- **Agent OS:** https://buildermethods.com/agent-os
- **Creator:** Brian Casel @ Builder Methods
- **Our Process:** https://github.com/workingman/mermaid-viewer (mmv project)
- **Organization:** Sense and Motion, Vancouver BC

---

*This comparison was generated through systematic analysis of both systems' documentation, workflow patterns, and architectural decisions. Last updated: February 2026.*
