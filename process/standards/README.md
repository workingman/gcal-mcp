# Development Standards Library

## Overview

Coding standards and best practices for AI-assisted software development. These standards ensure consistency, quality, and maintainability across all code written by both human and AI agents.

**Source:** Adapted from Agent OS by Brian Casel (Builder Methods)
**Attribution:** See `ATTRIBUTION.md` for full details

---

## Quick Reference

### Always Apply
| Standard | File | Purpose |
|----------|------|---------|
| **Coding Style** | `global/coding-style.md` | Naming, formatting, DRY principles |
| **Error Handling** | `global/error-handling.md` | User-friendly errors, retry strategies |
| **Conventions** | `global/conventions.md` | Project structure, git commits, documentation |

### Apply When Relevant
| Standard | File | When to Use |
|----------|------|-------------|
| **API Design** | `backend/api.md` | Building REST APIs, HTTP endpoints |
| **Test Writing** | `testing/test-writing.md` | Writing unit, integration, E2E tests |

---

## Directory Structure

```
standards/
├── ATTRIBUTION.md          # Credit to Agent OS, comparison with our process
├── README.md               # This file
├── global/                 # Apply to all projects
│   ├── coding-style.md     # Naming, formatting, DRY
│   ├── error-handling.md   # Errors, retries, logging
│   └── conventions.md      # Git, docs, env vars
├── backend/                # Server-side development
│   └── api.md              # REST API design, versioning
├── frontend/               # UI development (when applicable)
│   └── (future: components.md, responsive.md)
└── testing/                # QA and testing
    └── test-writing.md     # Test strategy, coverage, tools
```

---

## How to Use These Standards

### During PRD Creation
- Review **conventions.md** for project structure guidance
- Consider **error-handling.md** when defining user experience

### During TDD Creation
- Reference **coding-style.md** for module organization
- Reference **api.md** if designing REST endpoints
- Reference **test-writing.md** to define test requirements per issue

### During Issue Implementation
- Agents must follow **coding-style.md** and **error-handling.md**
- If building APIs, follow **api.md**
- If writing tests, follow **test-writing.md**

### During Code Review
- Check compliance with applicable standards
- Use standards as basis for feedback

---

## Key Differences from Agent OS

**Agent OS Philosophy:**
- Minimal testing during development (defer edge cases)
- Tool-agnostic (works with any IDE)
- Manual subagent orchestration

**Our Modifications:**
- **Per-issue test coverage** for safe parallel execution
- **GitHub Issues as source of truth** (not markdown files)
- **Dependency-aware parallelization** (automatic wave execution)
- **Context optimization** (TDD excerpts, checkpoint protocols)

See `ATTRIBUTION.md` for detailed comparison.

---

## Progressive Disclosure

**Don't overwhelm agents with all standards at once.**

Instead, load standards progressively based on task:
1. **Always load:** `coding-style.md`, `error-handling.md`
2. **Load when needed:**
   - Building APIs → load `api.md`
   - Writing tests → load `test-writing.md`
   - UI work → load `frontend/components.md`

**In GitHub issue prompts:**
```markdown
## Applicable Standards
- process/standards/global/coding-style.md
- process/standards/global/error-handling.md
- process/standards/backend/api.md  (because this issue builds REST endpoints)
```

---

## Contribution

### Adding New Standards
When adding standards:
1. Follow existing file structure (## headings, examples, "Good/Bad" comparisons)
2. Update this README with new standard location
3. Maintain attribution to Agent OS if derived from their work
4. Include "Last Updated" date at bottom

### Updating Existing Standards
- Document what changed and why
- Update "Last Updated" date
- If diverging from Agent OS, explain rationale

---

## Further Reading

- **Agent OS:** https://buildermethods.com/agent-os
- **Our Process Docs:** `process/README.md`
- **Comparison:** `/Users/sam/dev/codex-calendar-mcp/agent-os-comparison.md`

---

*Last Updated: 2026-02-16*
