# Standards Library Attribution

## Source

The coding standards in this directory are adapted from **Agent OS**, a comprehensive system for AI-assisted software development.

**Original Creator:** Brian Casel
**Organization:** Builder Methods
**Website:** https://buildermethods.com/agent-os
**Repository:** https://github.com/buildermethods/agent-os (if public)

## License & Usage

Agent OS standards are used here with attribution and gratitude to Brian Casel for open-sourcing a well-structured approach to agentic development.

**Our adaptations:**
- Integrated with Sense and Motion development process (GitHub Issues, dependency-aware execution)
- Modified for Claude Code + GitHub workflow optimization
- Added context optimization patterns specific to our orchestrator
- Structured for progressive disclosure (only load relevant standards per task)

## What We Kept

✅ **Coding Style Principles** - Naming conventions, DRY, meaningful names
✅ **Error Handling Patterns** - User-friendly messages, fail-fast, retry strategies
✅ **Testing Best Practices** - Behavior over implementation, mock external dependencies
✅ **API Design Conventions** - REST principles, versioning, error responses
✅ **Data Modeling Guidelines** - Validation, normalization, migrations
✅ **Frontend Standards** - Component architecture, state management, accessibility

## What We Changed

🔧 **Test Writing Philosophy** - Agent OS emphasizes minimal testing during development; we require per-issue test coverage for parallel execution safety
🔧 **Backward Compatibility** - Agent OS assumes no backward compatibility unless specified; we require explicit documentation of breaking changes
🔧 **Context Optimization** - Added patterns for TDD excerpt extraction and checkpoint protocols (our innovation)

## What We Added

➕ **Agent Execution Standards** - Guidelines for writing agent-executable issues
➕ **Dependency Encoding** - How to structure GitHub issue dependencies for parallel execution
➕ **Git Isolation Protocol** - Safe practices for parallel agent commits
➕ **Orchestrator Monitoring** - Context usage thresholds and intervention protocols

## Comparison: Agent OS vs. Sense and Motion Process

See `/Users/sam/dev/codex-calendar-mcp/agent-os-comparison.md` for a detailed comparison of the two systems.

**TL;DR:**
- **Agent OS:** Flexible, tool-agnostic, strong requirements gathering, comprehensive standards
- **Sense and Motion:** Optimized for speed (30-50% faster), GitHub-native, dependency-aware parallelization

Both systems are complementary. We recommend:
- Use **Agent OS requirements gathering** (`spec-shaper`) to produce our PRD
- Use **our orchestrator** (`execute-issues.md`) for parallel implementation
- Use **Agent OS standards** (these files) during development

## Credit Where Credit is Due

Brian Casel and the Agent OS project have made a significant contribution to the field of AI-assisted development. These standards represent years of refinement and real-world application.

**We stand on the shoulders of giants.**

If you use these standards in your projects, please:
1. Maintain this attribution file
2. Credit Agent OS in your documentation
3. Consider contributing back improvements to Agent OS

## Contact & Collaboration

**Sense and Motion:** Vancouver, BC (Geoff)
**Builder Methods (Agent OS):** Brian Casel

We're happy to collaborate on bridging these two systems. Reach out if interested in:
- Cross-system compatibility (Agent OS specs → our orchestrator)
- Shared standards evolution
- Case studies and benchmarks

---

*Last Updated: 2026-02-16*
