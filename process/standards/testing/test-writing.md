# Test Writing Standards

**Source:** Adapted from Agent OS by Brian Casel (Builder Methods) with Sense and Motion modifications
**Attribution:** See `process/standards/ATTRIBUTION.md`

---

## Philosophy: Strategic Testing for Agent Execution

**Agent OS Approach:** Write minimal tests during development, focus on core flows, defer edge cases.

**Our Modification:** Write **per-issue test coverage** to enable safe parallel agent execution. Tests serve as regression guards when multiple agents modify shared code.

### When to Test (Our Standard)

- **Always:** Tests for each GitHub issue during implementation
- **Required:** Core user flows, critical business logic
- **Recommended:** Integration tests for external APIs
- **Optional (defer):** Edge cases, error states, non-critical utilities

**Rationale:** Parallel agents need test coverage to detect conflicts. If Agent A modifies `module-x.ts` while Agent B modifies `module-y.ts` that depends on `module-x`, tests catch integration breaks.

---

## Test Coverage Best Practices

### Write Tests at Logical Completion Points
- **Do NOT** write tests for every change or intermediate step
- Focus on completing the feature implementation first
- Add strategic tests at logical checkpoints

**Example (from GitHub issue):**
```markdown
## Checkpoints
1. [ ] Implement token encryption (AES-256-GCM)
2. [ ] Write encryption/decryption tests (5-6 tests)
3. [ ] Implement HMAC key derivation
4. [ ] Write HMAC tests (3-4 tests)
```

### Test Only Core User Flows
- Write tests exclusively for critical paths and primary user workflows
- Skip writing tests for non-critical utilities and secondary workflows until instructed
- Focus on "happy path" first, errors second

**Core flows example (Calendar MCP):**
```typescript
describe('Calendar API Integration', () => {
  it('fetches events for authenticated user', async () => { ... });
  it('creates event with attendees', async () => { ... });
  it('handles rate limiting with retry', async () => { ... });
});
```

**Skip (unless instructed):**
```typescript
// Don't test edge cases during initial implementation:
it('handles empty attendee list', async () => { ... });
it('validates event title length < 1000 chars', async () => { ... });
```

### Defer Edge Case Testing
- **Do NOT** test edge cases, error states, or validation logic unless they are business-critical
- These can be addressed in dedicated testing phases, not during feature development

**Business-critical edge case (test now):**
```typescript
it('prevents cross-user token access', async () => {
  // Security-critical, must test
});
```

**Non-critical edge case (defer):**
```typescript
it('handles missing timezone in event', async () => {
  // Nice to have, defer
});
```

---

## Testing Principles

### Test Behavior, Not Implementation
- Focus tests on **what the code does**, not **how it does it**
- Reduces brittleness when refactoring internal implementation

**Good (behavior):**
```typescript
it('returns user events within date range', async () => {
  const events = await listEvents('next 7 days');
  expect(events).toHaveLength(3);
  expect(events[0].summary).toBe('Team Meeting');
});
```

**Bad (implementation details):**
```typescript
it('calls fetchEvents with correct parameters', async () => {
  const spy = jest.spyOn(api, 'fetchEvents');
  await listEvents('next 7 days');
  expect(spy).toHaveBeenCalledWith({ timeMin: '...', timeMax: '...' });
});
```

### Clear Test Names
- Use descriptive names that explain **what's being tested** and **expected outcome**
- Format: `it('does X when Y')` or `it('should do X')`

**Good:**
```typescript
describe('Token Encryption', () => {
  it('encrypts tokens with AES-256-GCM and unique IV', async () => { ... });
  it('decrypts tokens and validates user ownership', async () => { ... });
  it('rejects tokens with tampered ciphertext', async () => { ... });
});
```

**Bad:**
```typescript
describe('Crypto', () => {
  it('test1', async () => { ... });
  it('works', async () => { ... });
});
```

### Mock External Dependencies
- Isolate units by mocking databases, APIs, file systems, and other external services
- Use real implementations only in integration tests

**Example (mocking Google Calendar API):**
```typescript
// Unit test - mock the API
const mockFetch = jest.fn().mockResolvedValue({
  json: () => ({ items: [{ id: '123', summary: 'Test Event' }] })
});
global.fetch = mockFetch;

// Integration test - use real API (or test account)
const realAPI = new GoogleCalendarAPI(testCredentials);
const events = await realAPI.listEvents();
```

### Fast Execution
- Keep unit tests fast (milliseconds each)
- Developers should run tests frequently during development
- Slow tests get skipped, defeating their purpose

**Fast (good):**
```typescript
it('validates email format', () => {
  expect(isValidEmail('user@example.com')).toBe(true);
  expect(isValidEmail('invalid')).toBe(false);
});  // < 1ms
```

**Slow (avoid in unit tests):**
```typescript
it('sends real email and checks inbox', async () => {
  await sendEmail('test@example.com', 'subject', 'body');
  await sleep(5000);  // Wait for delivery
  const inbox = await fetchInbox();
  expect(inbox).toContain('subject');
});  // > 5 seconds
```

---

## Test Organization

### File Naming
- Unit tests: `module-name.test.ts` (same directory or `tests/` mirror)
- Integration tests: `module-name.integration.test.ts`
- E2E tests: `e2e-flow-name.test.ts`

**Example:**
```
src/
├── crypto.ts
├── calendar-api.ts
tests/
├── crypto.test.ts              # Unit tests
├── calendar-api.test.ts        # Unit tests
├── calendar-api.integration.test.ts  # Integration tests
├── e2e-oauth-flow.test.ts      # E2E test
```

### Test Structure (AAA Pattern)
- **Arrange** - Set up test data and mocks
- **Act** - Execute the code under test
- **Assert** - Verify expected outcome

```typescript
it('encrypts and decrypts tokens correctly', async () => {
  // Arrange
  const tokenManager = new TokenManager(testKey);
  const tokens = { access_token: 'abc123', refresh_token: 'xyz789' };

  // Act
  const encrypted = await tokenManager.encrypt(tokens);
  const decrypted = await tokenManager.decrypt(encrypted);

  // Assert
  expect(decrypted).toEqual(tokens);
});
```

---

## Test Coverage Metrics

### Target Coverage (Per Module)
- **Critical modules** (auth, security): 90%+
- **Core logic** (business rules): 80%+
- **Utilities** (helpers): 70%+
- **Glue code** (routing, config): 50%+ (or skip)

### What to Measure
- **Line coverage** - Percentage of lines executed
- **Branch coverage** - Percentage of conditional branches taken
- **Function coverage** - Percentage of functions called

**Run coverage:**
```bash
npm test -- --coverage
```

---

## Testing Tools

### Recommended Stack
- **Test Runner:** Vitest (fast, ESM-native) or Node.js built-in `--test`
- **Assertions:** Built-in or Vitest expect
- **Mocking:** Vitest mocks or sinon
- **Integration:** Miniflare (for Cloudflare Workers)
- **E2E/Visual:** Playwright (browser testing, screenshots)

### Example (Vitest):
```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('TokenManager', () => {
  let tokenManager: TokenManager;

  beforeEach(() => {
    tokenManager = new TokenManager(testKey);
  });

  it('generates unique IVs for each encryption', async () => {
    const tokens = { access_token: 'test' };
    const encrypted1 = await tokenManager.encrypt(tokens);
    const encrypted2 = await tokenManager.encrypt(tokens);

    expect(encrypted1.iv).not.toBe(encrypted2.iv);
  });
});
```

---

## Integration Testing

### When to Write Integration Tests
- **After** unit tests pass
- For external API interactions (Google Calendar, Cloudflare KV)
- For multi-module workflows (OAuth flow, token refresh)

### Setup/Teardown
- Use `beforeEach` / `afterEach` for test isolation
- Clean up test data (database records, KV entries)

**Example:**
```typescript
describe('Google Calendar API Integration', () => {
  let api: GoogleCalendarAPI;
  let testUserId: string;

  beforeEach(async () => {
    testUserId = `test-user-${Date.now()}`;
    api = new GoogleCalendarAPI(env);
    await api.authenticate(testUserId);
  });

  afterEach(async () => {
    // Clean up test user data
    await env.GOOGLE_TOKENS_KV.delete(`google_tokens:${testUserId}`);
  });

  it('fetches events from primary calendar', async () => {
    const events = await api.listEvents({ timeMin: '2026-02-01', timeMax: '2026-02-28' });
    expect(events).toBeInstanceOf(Array);
  });
});
```

---

## Visual Testing (Playwright)

**Inspired by Agent OS visual verification practices.**

### When to Use Playwright
- Testing UI components (OAuth screens, error messages)
- Capturing screenshots for QA evidence
- Visual regression testing (before/after comparisons)

### Example (OAuth Flow Screenshot):
```typescript
import { test, expect } from '@playwright/test';

test('OAuth consent screen renders correctly', async ({ page }) => {
  await page.goto('https://calendar-mcp.example.workers.dev/google/login');

  // Wait for redirect to Google OAuth
  await page.waitForURL(/accounts\.google\.com/);

  // Capture screenshot
  await page.screenshot({ path: 'docs/visuals/oauth/consent-screen.png' });

  // Verify key elements
  await expect(page.locator('h1')).toContainText('Sign in');
});
```

**Store screenshots in:** `docs/visuals/oauth/` or `docs/visuals/verification/`

---

## Test Maintenance

### Flaky Tests
- **Fix immediately** - Flaky tests erode trust
- Common causes: Race conditions, timing issues, shared state
- Use retry strategies sparingly (prefer fixing root cause)

### Obsolete Tests
- Delete tests for removed features
- Update tests when behavior changes (don't just make them pass)
- Refactor tests when they become hard to understand

---

## Further Reading

- **Agent OS Standards:** https://buildermethods.com/agent-os
- **Vitest Documentation:** https://vitest.dev
- **Playwright Documentation:** https://playwright.dev
- **Testing Best Practices:** https://testingjavascript.com/

---

*Last Updated: 2026-02-16*
