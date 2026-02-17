# Error Handling Standards

**Source:** Adapted from Agent OS by Brian Casel (Builder Methods)
**Attribution:** See `process/standards/ATTRIBUTION.md`

---

## Core Principles

### User-Friendly Messages
- Provide clear, actionable error messages to users without exposing technical details or security information
- Tell users **what went wrong** and **what they can do about it**
- Never expose stack traces, internal paths, or database details to end users

**Good:**
```
Error: Google account not connected for user@example.com

Please authorize access by visiting:
https://calendar-mcp.example.workers.dev/google/login
```

**Bad:**
```
Error: TypeError: Cannot read property 'access_token' of undefined
    at CalendarAPI.fetchEvents (/src/calendar-api.ts:142:27)
```

### Fail Fast and Explicitly
- Validate input and check preconditions early in the function
- Fail with clear error messages rather than allowing invalid state to propagate
- Use guard clauses at the top of functions

**Good:**
```typescript
async function fetchEvents(userId: string, dateRange: string) {
  if (!userId) {
    throw new Error('userId is required');
  }
  if (!dateRange) {
    throw new Error('dateRange is required');
  }
  // ... proceed with logic
}
```

**Bad:**
```typescript
async function fetchEvents(userId: string, dateRange: string) {
  // ... 50 lines of logic
  const events = await api.get(`/calendar/${userId || 'default'}/events`);
  // ... implicit failure somewhere deep in call stack
}
```

### Specific Exception Types
- Use specific exception/error types rather than generic ones to enable targeted handling
- Create custom error classes for domain-specific failures

**TypeScript Example:**
```typescript
class AuthenticationError extends Error {
  constructor(message: string, public userId: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

class RateLimitError extends Error {
  constructor(message: string, public retryAfter: number) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// Usage:
if (!tokens) {
  throw new AuthenticationError('No access token found', userId);
}

if (response.status === 429) {
  throw new RateLimitError('Rate limit exceeded', parseInt(response.headers.get('Retry-After') || '60'));
}
```

### Centralized Error Handling
- Handle errors at appropriate boundaries (controllers, API layers) rather than scattering try-catch blocks everywhere
- Use middleware or error boundaries to catch and format errors consistently

**Example (Hono middleware):**
```typescript
app.use(async (c, next) => {
  try {
    await next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return c.json({ error: error.message, authUrl: '/google/login' }, 401);
    }
    if (error instanceof RateLimitError) {
      return c.json({ error: error.message, retryAfter: error.retryAfter }, 429);
    }
    // Generic error fallback
    console.error('Unexpected error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});
```

### Graceful Degradation
- Design systems to degrade gracefully when non-critical services fail rather than breaking entirely
- Return partial results when possible

**Example:**
```typescript
async function fetchMultipleCalendars(calendarIds: string[]) {
  const results = await Promise.allSettled(
    calendarIds.map(id => fetchCalendar(id))
  );

  const successful = results
    .filter((r): r is PromiseFulfilledResult<Calendar> => r.status === 'fulfilled')
    .map(r => r.value);

  const failed = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map(r => r.reason);

  if (failed.length > 0) {
    console.warn(`Failed to fetch ${failed.length} calendars:`, failed);
  }

  return successful; // Return what we got, even if some failed
}
```

### Retry Strategies
- Implement exponential backoff for transient failures in external service calls
- Set maximum retry counts to avoid infinite loops
- Log retry attempts for debugging

**Example:**
```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: { maxRetries: number; baseDelay: number } = { maxRetries: 3, baseDelay: 1000 }
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < options.maxRetries) {
        const delay = options.baseDelay * Math.pow(2, attempt);
        console.log(`Retry attempt ${attempt + 1} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Failed after ${options.maxRetries} retries: ${lastError!.message}`);
}
```

### Clean Up Resources
- Always clean up resources (file handles, connections, locks) in finally blocks or equivalent mechanisms
- Use `try...finally` to guarantee cleanup even if errors occur

**Example:**
```typescript
async function processWithLock(resourceId: string) {
  await acquireLock(resourceId);
  try {
    // Do processing
    return await heavyComputation(resourceId);
  } finally {
    // Guaranteed to run even if error occurs
    await releaseLock(resourceId);
  }
}
```

---

## Error Logging

### What to Log
- **Error type and message**
- **User ID or session ID** (hashed/anonymized if needed)
- **Request context** (endpoint, parameters, timestamp)
- **Stack trace** (in server logs, never to users)

### What NOT to Log
- Passwords or tokens
- Personal identifiable information (PII) unless necessary and compliant
- Full request/response bodies (may contain sensitive data)

**Example:**
```typescript
catch (error) {
  console.error({
    error: error.message,
    type: error.name,
    userId: hashUserId(userId),  // Hashed, not plaintext
    endpoint: request.url,
    timestamp: new Date().toISOString(),
    // stack: error.stack  // Include in dev, exclude in prod
  });
  throw error;
}
```

---

## HTTP Status Codes (for APIs)

Use appropriate, consistent HTTP status codes:

| Code | Meaning | When to Use |
|------|---------|-------------|
| **200** | OK | Successful GET, PUT, PATCH (with response body) |
| **201** | Created | Successful POST that creates a resource |
| **204** | No Content | Successful DELETE or PUT/PATCH with no response body |
| **400** | Bad Request | Invalid input, validation errors |
| **401** | Unauthorized | Missing or invalid authentication |
| **403** | Forbidden | Authenticated but lacks permission |
| **404** | Not Found | Resource doesn't exist |
| **409** | Conflict | Resource state conflict (e.g., duplicate) |
| **429** | Too Many Requests | Rate limit exceeded |
| **500** | Internal Server Error | Unexpected server error |
| **502** | Bad Gateway | Upstream service error |
| **503** | Service Unavailable | Temporary service outage |

**Example:**
```typescript
// 400 - Invalid input
if (!isValidEmail(email)) {
  return c.json({ error: 'Invalid email format' }, 400);
}

// 401 - Not authenticated
if (!tokens) {
  return c.json({ error: 'Authentication required', authUrl: '/login' }, 401);
}

// 404 - Resource not found
if (!event) {
  return c.json({ error: `Event ${eventId} not found` }, 404);
}

// 429 - Rate limit
if (isRateLimited(userId)) {
  return c.json({ error: 'Rate limit exceeded', retryAfter: 60 }, 429);
}
```

---

## Security Considerations

### Never Expose
- Stack traces in production
- Database connection strings
- API keys or secrets
- Internal file paths
- Library versions (in error messages)

### Sanitize User Input in Errors
If you include user input in error messages, sanitize it:

**Bad:**
```typescript
throw new Error(`Invalid calendar ID: ${userInput}`);
// If userInput is a script tag, this could enable XSS
```

**Good:**
```typescript
throw new Error(`Invalid calendar ID: ${sanitize(userInput)}`);
// Or better: don't include user input at all
throw new Error('Invalid calendar ID format');
```

---

## Further Reading

- **Agent OS Standards:** https://buildermethods.com/agent-os
- **HTTP Status Codes:** https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
- **Error Handling Best Practices:** https://www.joyent.com/node-js/production/design/errors

---

*Last Updated: 2026-02-16*
