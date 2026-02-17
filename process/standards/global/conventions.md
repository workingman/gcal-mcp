# General Development Conventions

**Source:** Adapted from Agent OS by Brian Casel (Builder Methods)
**Attribution:** See `process/standards/ATTRIBUTION.md`

---

## Project Structure

### Consistent Organization
- Organize files and directories in a predictable, logical structure that team members can navigate easily
- Group by feature/domain, not by technical type

**Good (feature-based):**
```
src/
├── user-management/
│   ├── user-service.ts
│   ├── user-repository.ts
│   ├── user-types.ts
│   └── user-validator.ts
├── calendar-api/
│   ├── calendar-client.ts
│   ├── calendar-types.ts
│   └── date-utils.ts
```

**Bad (type-based):**
```
src/
├── services/
│   ├── user-service.ts
│   └── calendar-service.ts
├── repositories/
│   └── user-repository.ts
├── types/
│   ├── user-types.ts
│   └── calendar-types.ts
```

### Standard Directories
- `src/` - Source code
- `tests/` - Test files (mirror `src/` structure)
- `docs/` - Documentation (architecture, setup guides)
- `scripts/` - Build and deployment automation
- `process/` - Development process templates (PRD, TDD, QA)

---

## Documentation

### Clear README
Every project must have a README with:

1. **What it is** (1-2 sentences)
2. **How to install/setup** (step-by-step)
3. **How to use** (examples)
4. **Architecture overview** (diagram or brief explanation)
5. **Testing** (how to run tests)
6. **Deployment** (how to deploy)
7. **Contributing** (if open-source)

**Template:**
```markdown
# Project Name

One-line description of what this does.

## Features
- Feature 1
- Feature 2

## Prerequisites
- Node.js 20+
- Cloudflare account

## Setup
\`\`\`bash
npm install
bash scripts/setup.sh
\`\`\`

## Usage
\`\`\`bash
npm run dev
\`\`\`

## Architecture
[Diagram or brief explanation]

## Testing
\`\`\`bash
npm test
\`\`\`

## Deployment
\`\`\`bash
npm run deploy
\`\`\`
```

### Documentation Locations
- **README.md** - Quick start, setup, usage
- **docs/architecture.md** - System design, components, data flow
- **docs/setup-guide.md** - Detailed setup (OAuth, secrets, deployment)
- **docs/testing-guide.md** - Test organization, running tests, coverage
- **docs/api.md** - API reference (if applicable)

---

## Version Control

### Git Commit Messages
Follow conventional commits format:

```
<type>: <imperative summary> (#<issue-number>)

Optional body explaining WHY the change was made.
```

**Types:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `refactor:` - Code restructuring (no behavior change)
- `test:` - Test additions or fixes
- `chore:` - Build, tooling, dependencies

**Examples:**
```
feat: add OAuth token refresh with proactive 5-minute threshold (#23)

This prevents API calls with expired tokens by refreshing 5 minutes
before expiry. Reduces user-facing authentication errors.
```

```
fix: validate user_id_hash before returning decrypted tokens (#31)

Closes security gap where cross-user access was possible if encryption
key was compromised. Adds second validation layer.
```

### Branch Strategy
- **`main`** - Production-ready code (protected)
- **`feature/<name>`** - New features
- **`fix/<name>`** - Bug fixes
- **`refactor/<name>`** - Code improvements

**Naming:**
- Use lowercase with hyphens: `feature/oauth-integration`
- Include issue number if applicable: `fix/rate-limiting-#42`

### Pull Request Template
```markdown
## Description
[What does this PR do?]

## Related Issue
Closes #[issue-number]

## Changes
- [Change 1]
- [Change 2]

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guide
- [ ] Documentation updated
- [ ] No secrets committed
```

---

## Environment Configuration

### Never Commit Secrets
- Use environment variables for configuration
- Never commit secrets or API keys to version control
- Use `.env` files locally (add to `.gitignore`)
- Use secret management in production (e.g., Cloudflare Secrets, AWS Secrets Manager)

### Environment Variable Naming
- Use `SCREAMING_SNAKE_CASE`
- Prefix by service/category: `GOOGLE_CLIENT_ID`, `CLOUDFLARE_ACCOUNT_ID`
- Document all required env vars in README

**Example `.env.example`:**
```bash
# Google OAuth
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here

# Encryption
TOKEN_ENCRYPTION_KEY=generate-with-crypto-randomBytes-32
TOKEN_HMAC_KEY=generate-with-crypto-randomBytes-32

# Worker URL
WORKER_URL=https://calendar-mcp.your-subdomain.workers.dev
```

---

## Dependency Management

### Keep Dependencies Minimal
- Only add dependencies when necessary
- Prefer native APIs when available (e.g., `fetch` over `axios`)
- Document why major dependencies are used

**Example (package.json with rationale):**
```json
{
  "dependencies": {
    "hono": "^4.0.0",           // Lightweight router for Cloudflare Workers
    "@modelcontextprotocol/sdk": "^1.0.4",  // MCP protocol implementation
    "zod": "^3.23.8"            // Runtime type validation
  }
}
```

### Keep Dependencies Up-to-Date
- Run `npm audit` regularly
- Update dependencies monthly (or when security issues arise)
- Test after updates (regression testing)

---

## Code Review

### Code Review Process
1. **Author self-review** - Review your own PR before requesting review
2. **Assign reviewers** - Tag 1-2 people with context
3. **Review within 24 hours** - Keep PRs moving
4. **Approval required** - At least 1 approval before merge
5. **Address feedback** - Respond to all comments (fix or explain)

### What Reviewers Check
- [ ] Code follows style guide
- [ ] Tests are comprehensive and pass
- [ ] No secrets or sensitive data committed
- [ ] Documentation is updated
- [ ] Error handling is appropriate
- [ ] No obvious security issues
- [ ] Changes match PR description

---

## Testing Requirements

### Required Test Coverage
- **Unit tests** - Pure functions, business logic
- **Integration tests** - API endpoints, database interactions
- **Security tests** - Authentication, authorization, data isolation
- **E2E tests** - Critical user flows (optional but recommended)

### Before Merging
- [ ] All tests pass (`npm test`)
- [ ] No failing lint checks (`npm run lint`)
- [ ] Type checking passes (`npm run typecheck`)
- [ ] Coverage meets threshold (aim for 80%+ on critical modules)

---

## Feature Flags

### Use Feature Flags for Incomplete Features
- Don't merge incomplete features to `main`
- Use feature flags for gradual rollout
- Remove feature flags after feature is stable

**Example:**
```typescript
const ENABLE_NEW_CALENDAR_SYNC = process.env.ENABLE_NEW_CALENDAR_SYNC === 'true';

if (ENABLE_NEW_CALENDAR_SYNC) {
  await syncCalendarsV2(userId);
} else {
  await syncCalendars(userId);  // Old implementation
}
```

---

## Changelog Maintenance

### Keep a Changelog
- Use `CHANGELOG.md` or GitHub Releases
- Document significant changes and improvements
- Follow Keep a Changelog format: https://keepachangelog.com/

**Example:**
```markdown
# Changelog

## [Unreleased]
### Added
- OAuth token refresh with 5-minute proactive threshold

### Fixed
- Security: Multi-user isolation validation

## [0.1.0] - 2026-02-15
### Added
- Initial release with 7 MCP tools
- Google Calendar API integration
- Encrypted token storage in Cloudflare KV
```

---

## Further Reading

- **Agent OS Standards:** https://buildermethods.com/agent-os
- **Conventional Commits:** https://www.conventionalcommits.org/
- **Keep a Changelog:** https://keepachangelog.com/
- **Git Best Practices:** https://git-scm.com/book/en/v2

---

*Last Updated: 2026-02-16*
