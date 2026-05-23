# Coding Style Standards

**Source:** Adapted from Agent OS by Brian Casel (Builder Methods)
**Attribution:** See `process/standards/ATTRIBUTION.md`

---

## Core Principles

### Consistent Naming Conventions
- Establish and follow naming conventions for variables, functions, classes, and files across the codebase
- Use `camelCase` for variables and functions in JavaScript/TypeScript
- Use `PascalCase` for classes and TypeScript interfaces
- Use `kebab-case` for file names
- Use `SCREAMING_SNAKE_CASE` for constants

### Automated Formatting
- Maintain consistent code style (indenting, line breaks, etc.)
- Use Prettier or similar formatter (configure once, enforce automatically)
- Run formatter on save (editor integration)
- Include formatter in CI/CD pipeline

### Meaningful Names
- Choose descriptive names that reveal intent
- Avoid abbreviations except for well-known terms (e.g., `url`, `id`, `api`)
- Avoid single-letter variables except in narrow contexts (e.g., loop counters `i`, `j`)
- Boolean variables should read as questions: `isValid`, `hasPermission`, `canEdit`

**Good:**
```typescript
const userAuthenticationToken = await fetchToken(userId);
```

**Bad:**
```typescript
const uat = await fetchToken(u);
```

### Small, Focused Functions
- Keep functions small and focused on a single task
- Aim for <50 lines per function (guideline, not hard rule)
- If a function does multiple things, extract helper functions
- Function names should be verbs: `calculateTotal`, `validateInput`, `fetchUser`

### Consistent Indentation
- Use consistent indentation (spaces or tabs)
- Configure your editor/linter to enforce it
- Default: 2 spaces for JavaScript/TypeScript, 4 spaces for Python

### Remove Dead Code
- Delete unused code, commented-out blocks, and imports rather than leaving them as clutter
- Trust version control to preserve history
- If you're unsure if code is used, use your IDE's "Find References" before deleting

### Backward Compatibility
- **Default assumption:** You do NOT need to write additional code logic for backward compatibility
- Unless specifically instructed otherwise, assume you can make breaking changes
- If backward compatibility is required, document migration path

### DRY Principle (Don't Repeat Yourself)
- Avoid duplication by extracting common logic into reusable functions or modules
- **But:** Don't abstract prematurely. Three instances = consider abstracting, two = leave alone
- If logic is only used once, keep it inline (don't create "utility functions" for one-time operations)

---

## TypeScript-Specific Standards

### Type Safety
- Prefer explicit types over `any` (use `unknown` if truly unknown)
- Use union types for known variants: `type Status = 'pending' | 'active' | 'complete'`
- Define interfaces for objects with more than 3 properties
- Use `readonly` for immutable properties

**Good:**
```typescript
interface User {
  readonly id: string;
  name: string;
  email: string;
  status: 'active' | 'inactive';
}
```

**Bad:**
```typescript
function updateUser(user: any) { ... }
```

### Async/Await Over Promises
- Use `async/await` syntax for clarity
- Avoid `.then()` chains unless there's a good reason

**Good:**
```typescript
async function fetchUserData(userId: string): Promise<User> {
  const response = await fetch(`/api/users/${userId}`);
  return await response.json();
}
```

**Bad:**
```typescript
function fetchUserData(userId: string): Promise<User> {
  return fetch(`/api/users/${userId}`)
    .then(response => response.json());
}
```

---

## File Organization

### Module Structure
- One class or major function per file
- Group related utilities in a single file (e.g., `date-utils.ts`)
- Use index files (`index.ts`) to re-export public API

### Directory Naming
- Use `kebab-case` for directory names
- Group by feature/domain, not by type

**Good:**
```
src/
├── user-management/
│   ├── user-service.ts
│   ├── user-repository.ts
│   └── user-types.ts
```

**Bad:**
```
src/
├── services/
│   └── user-service.ts
├── repositories/
│   └── user-repository.ts
└── types/
    └── user-types.ts
```

---

## Comments

### When to Comment
- **Do comment:** Complex algorithms, non-obvious business logic, "why" decisions
- **Don't comment:** Obvious code (the code should be self-documenting)

**Good:**
```typescript
// Retry with exponential backoff to handle rate limits (Google Calendar API allows 10 req/sec)
await retryWithBackoff(() => fetchEvents(), { maxRetries: 3 });
```

**Bad:**
```typescript
// Increment counter by 1
counter++;
```

### JSDoc for Public APIs
- Use JSDoc for functions/classes exposed to other modules
- Include parameter types, return types, and usage examples

```typescript
/**
 * Fetches events from Google Calendar within a date range.
 *
 * @param dateRange - Natural language date range (e.g., "next 7 days", "this week")
 * @param calendarId - Optional calendar ID (defaults to primary calendar)
 * @returns Array of calendar events
 *
 * @example
 * const events = await listEvents("next 7 days");
 */
export async function listEvents(dateRange: string, calendarId?: string): Promise<Event[]> {
  // ...
}
```

---

## Linting & Enforcement

### Recommended Tools
- **ESLint** for JavaScript/TypeScript
- **Prettier** for code formatting
- **TypeScript compiler** (`tsc --noEmit`) for type checking

### CI/CD Integration
- Run linter in CI pipeline (fail build on violations)
- Run formatter check (fail if code is not formatted)
- Run type checker (fail on type errors)

---

## Further Reading

- **Agent OS Standards:** https://buildermethods.com/agent-os
- **TypeScript Handbook:** https://www.typescriptlang.org/docs/
- **Clean Code (Robert C. Martin):** https://www.amazon.com/Clean-Code-Handbook-Software-Craftsmanship/dp/0132350882

---

*Last Updated: 2026-02-16*
