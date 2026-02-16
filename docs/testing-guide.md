# Developer Testing Guide

Complete guide for running, writing, and maintaining tests for the Calendar MCP Server.

---

## Table of Contents

1. [Running Tests](#running-tests)
2. [Test Organization](#test-organization)
3. [Writing New Tests](#writing-new-tests)
4. [Mocking Strategies](#mocking-strategies)
5. [Coverage Requirements](#coverage-requirements)
6. [CI/CD Integration](#cicd-integration)

---

## Running Tests

### Run All Tests

```bash
npm test
```

**Expected output:** 298 tests passing
- Unit tests: 188 tests
- Integration tests: 62 tests
- Security tests: 33 tests
- E2E tests: 8 tests
- Performance tests: 7 tests

### Run Specific Test Suites

```bash
# Encryption/decryption
npm test crypto.test.ts

# Session validation
npm test session.test.ts

# Google Calendar API client
npm test calendar-api.test.ts

# MCP tools
npm test mcp-list-events.test.ts
npm test mcp-create-event.test.ts

# Security validation
npm test security-validation.test.ts
npm test security-integration.test.ts
npm test kv-key-security.test.ts

# End-to-end flows
npm test e2e-flow.test.ts

# Performance benchmarks
npm test performance.test.ts
```

### Run Tests with Coverage

```bash
npm test
```

Coverage report is automatically generated.

**Minimum coverage requirements:**
- Overall: 90%
- Statements: 90%
- Branches: 85%
- Functions: 93%

### Run Specific Test Pattern

```bash
# Run all security tests
npm test | grep -i security

# Run all MCP tool tests
npm test | grep mcp-

# Run tests for a specific file
node --test tests/crypto.test.ts
```

---

## Test Organization

### Directory Structure

```
tests/
├── crypto.test.ts                  # TokenManager unit tests
├── session.test.ts                 # Session validation tests
├── kv-storage.test.ts              # KV storage utilities
├── audit.test.ts                   # Audit logging tests
├── date-utils.test.ts              # Date parsing utilities
├── error-formatter.test.ts         # MCP error formatter
│
├── calendar-api.test.ts            # Calendar API client (unit)
├── calendar-api.integration.test.ts # Calendar API (integration)
│
├── mcp-*.test.ts                   # MCP tools (7 files)
├── oauth-*.test.ts                 # OAuth flows (4 files)
│
├── security-validation.test.ts     # SEC-001, SEC-002, SEC-004
├── security-integration.test.ts    # Multi-user attack scenarios
├── kv-key-security.test.ts         # HMAC non-enumeration
│
├── e2e-flow.test.ts                # End-to-end user journeys
├── performance.test.ts             # Performance benchmarks
│
└── token-refresh.test.ts           # Token refresh logic
```

### Test Categories

**Unit Tests** (files: `*.test.ts`, not `*.integration.test.ts`)
- Test individual functions and classes in isolation
- Mock external dependencies (Google API, KV)
- Fast execution (< 100ms per test)
- Example: `crypto.test.ts`, `session.test.ts`

**Integration Tests** (files: `*.integration.test.ts`)
- Test interactions between components
- Use real Web Crypto API (not mocked)
- Mock external APIs (Google Calendar)
- Example: `calendar-api.integration.test.ts`, `oauth-integration.test.ts`

**Security Tests** (files: `security-*.test.ts`, `kv-key-security.test.ts`)
- Validate security requirements (SEC-001, SEC-002, SEC-004)
- Test attack scenarios (session hijacking, cross-user access)
- Verify encrypted storage and HMAC validation
- Example: `security-validation.test.ts`

**E2E Tests** (files: `e2e-*.test.ts`)
- Test complete user flows from OAuth to tool usage
- Simulate multi-user concurrent scenarios
- Test error recovery and token refresh
- Example: `e2e-flow.test.ts`

**Performance Tests** (files: `performance.test.ts`)
- Validate CPU budget compliance (< 50ms for Workers)
- Benchmark encryption/decryption operations
- Test concurrent load (20-100 users)
- Example: `performance.test.ts`

---

## Writing New Tests

### Test Template

```typescript
// tests/my-feature.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MyFeature } from '../src/my-feature.ts';

describe('MyFeature', () => {
  it('should do something expected', async () => {
    // Arrange
    const feature = new MyFeature();
    const input = 'test';

    // Act
    const result = await feature.doSomething(input);

    // Assert
    assert.strictEqual(result, 'expected');
  });

  it('should handle error case gracefully', async () => {
    const feature = new MyFeature();

    // Test error handling
    await assert.rejects(
      async () => feature.doSomething('invalid'),
      /Expected error message/,
      'Should reject invalid input'
    );
  });
});
```

### Best Practices

1. **Use descriptive test names**
   ```typescript
   // Good
   it('should encrypt tokens with unique IV per operation')

   // Bad
   it('test encryption')
   ```

2. **Follow AAA pattern** (Arrange, Act, Assert)
   ```typescript
   it('should validate user session', async () => {
     // Arrange
     const userEmail = 'test@example.com';
     const encryptedToken = await createToken(userEmail);

     // Act
     const isValid = await validateSession(userEmail, encryptedToken);

     // Assert
     assert.strictEqual(isValid, true);
   });
   ```

3. **Test edge cases**
   - Empty inputs
   - Null/undefined values
   - Very large inputs (10KB+ payloads)
   - Concurrent operations
   - Error scenarios

4. **Use realistic test data**
   ```typescript
   // Good - realistic Google token format
   const token = 'ya29.a0AfB_byC...real_format';

   // Bad - unrealistic data
   const token = 'test_token_123';
   ```

5. **Avoid test interdependence**
   - Each test should be independent
   - Clean up after tests (clear mocks, reset state)
   - Don't rely on test execution order

---

## Mocking Strategies

### Mock KVNamespace

```typescript
class MockKV {
  private storage = new Map<string, string>();

  async put(key: string, value: string): Promise<void> {
    this.storage.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.storage.get(key) || null;
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async list(): Promise<{ keys: Array<{ name: string }> }> {
    return {
      keys: Array.from(this.storage.keys()).map((name) => ({ name })),
    };
  }

  clear(): void {
    this.storage.clear();
  }
}

// Usage
const kv = new MockKV() as unknown as KVNamespace;
```

### Mock Google Calendar API

```typescript
const mockFetch = async (url: string) => {
  if (url.includes('/calendarList')) {
    return new Response(
      JSON.stringify({
        items: [
          { id: 'primary', summary: 'Primary Calendar' },
        ],
      }),
      { status: 200 }
    );
  }

  if (url.includes('/events')) {
    return new Response(
      JSON.stringify({
        items: [
          {
            id: 'event1',
            summary: 'Test Event',
            start: { dateTime: '2026-02-20T10:00:00Z' },
            end: { dateTime: '2026-02-20T11:00:00Z' },
          },
        ],
      }),
      { status: 200 }
    );
  }

  return new Response(JSON.stringify({ items: [] }), { status: 200 });
};

// Usage
const result = await listCalendars(tokens, mockFetch as typeof fetch);
```

### Don't Mock: Web Crypto API

Use the **real** Web Crypto API in tests to ensure encryption works correctly:

```typescript
// Good - use real encryption
const encryptionKey = await importEncryptionKey(TEST_KEY);
const encrypted = await manager.encrypt(tokens, userId);

// Bad - mocking encryption defeats the purpose
const mockEncrypt = () => ({ iv: 'fake', ciphertext: 'fake' });
```

---

## Coverage Requirements

### Current Coverage (Target: 90%)

```
src/
├── audit.ts              100% ✓
├── calendar-api.ts       98%  ✓
├── crypto.ts            100% ✓
├── date-utils.ts         98%  ✓
├── error-formatter.ts   100% ✓
├── kv-storage.ts         97%  ✓
├── mcp-server.ts         81%  ⚠ (integration tests cover runtime paths)
├── session.ts           100% ✓
└── utils.ts              73%  ⚠ (HTML templates - low priority)
```

### Adding Coverage for New Features

1. **Write tests first** (TDD approach)
2. **Ensure all branches covered**
   ```typescript
   // Example: Test both branches
   if (condition) {
     // Test this path
   } else {
     // Test this path too
   }
   ```
3. **Cover error paths**
   ```typescript
   try {
     await riskyOperation();
   } catch (error) {
     // Test this catch block
   }
   ```

### Viewing Coverage Report

```bash
npm test
# Coverage report printed to stdout

# Look for:
# ℹ file                | line % | branch % | funcs % | uncovered lines
```

---

## CI/CD Integration

### GitHub Actions (Example)

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Run type checking
        run: npm run typecheck

      - name: Run tests
        run: npm test

      - name: Check coverage threshold
        run: |
          # Parse coverage and fail if below 90%
          npm test | grep "all files" | awk '{if ($4 < 90.00) exit 1}'
```

### Pre-commit Hook (Optional)

```bash
# .git/hooks/pre-commit
#!/bin/bash
npm run typecheck && npm test
```

---

## Debugging Tests

### Enable Verbose Output

```bash
node --test --test-reporter=spec tests/my-feature.test.ts
```

### Isolate Failing Test

```typescript
it.only('should test specific behavior', async () => {
  // Only this test will run
});
```

### Add Debug Logging

```typescript
it('should debug complex scenario', async () => {
  console.log('Debug: input =', input);
  const result = await doSomething(input);
  console.log('Debug: result =', result);
  assert.ok(result);
});
```

---

## Test Maintenance

### When to Update Tests

1. **Feature changes:** Update affected tests
2. **Bug fixes:** Add regression test
3. **Refactoring:** Tests should still pass (update if API changed)
4. **Security fixes:** Add security test to prevent regression

### Test Hygiene

- Remove obsolete tests when features are removed
- Keep test data realistic and up-to-date
- Update mocks when external APIs change
- Review test performance (slow tests > 1s should be optimized)

---

## Common Testing Patterns

### Testing Async Functions

```typescript
it('should handle async operations', async () => {
  const result = await asyncFunction();
  assert.ok(result);
});
```

### Testing Error Messages

```typescript
await assert.rejects(
  async () => functionThatThrows(),
  /Expected error message/,
  'Custom failure message'
);
```

### Testing Concurrent Operations

```typescript
it('should handle concurrent requests', async () => {
  const operations = Array.from({ length: 20 }, async (_, i) => {
    return doSomething(i);
  });

  const results = await Promise.all(operations);
  assert.strictEqual(results.length, 20);
});
```

### Performance Benchmarking

```typescript
it('should complete within time budget', async () => {
  const start = performance.now();
  await expensiveOperation();
  const duration = performance.now() - start;

  assert.ok(duration < 50, `Took ${duration}ms, expected < 50ms`);
});
```

---

## Additional Resources

- [Node.js Test Runner](https://nodejs.org/docs/latest/api/test.html)
- [Node.js Assert Module](https://nodejs.org/docs/latest/api/assert.html)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)

---

## Getting Help

- **Failing tests?** Check recent changes with `git diff`
- **Coverage drop?** Run `npm test` and check uncovered lines
- **Slow tests?** Profile with `node --test --test-reporter=spec`
- **Mock issues?** Review existing mocks in `tests/` directory

For test-specific questions, see project documentation or open a GitHub issue.
