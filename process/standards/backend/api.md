# API Design Standards

**Source:** Adapted from Agent OS by Brian Casel (Builder Methods)
**Attribution:** See `process/standards/ATTRIBUTION.md`

---

## RESTful Design Principles

### Resource-Based URLs
- Follow REST principles with clear resource-based URLs
- Use nouns for resources, not verbs
- Use HTTP methods to indicate actions

**Good:**
```
GET    /users          # List users
GET    /users/:id      # Get specific user
POST   /users          # Create user
PUT    /users/:id      # Update user (full replace)
PATCH  /users/:id      # Update user (partial)
DELETE /users/:id      # Delete user
```

**Bad:**
```
GET    /getUsers
POST   /createUser
POST   /updateUser
POST   /deleteUser
```

### HTTP Methods

| Method | Purpose | Idempotent? | Safe? |
|--------|---------|-------------|-------|
| GET | Retrieve resource(s) | Yes | Yes |
| POST | Create resource | No | No |
| PUT | Replace resource | Yes | No |
| PATCH | Update resource | No | No |
| DELETE | Remove resource | Yes | No |

**Idempotent:** Multiple identical requests have the same effect as one request
**Safe:** Does not modify server state

---

## Naming Conventions

### Consistent Casing
- Use **lowercase** with **hyphens** or **underscores** for URLs
- Be consistent across your entire API

**Good:**
```
/calendar-events
/user-preferences
```

**Good (alternative):**
```
/calendar_events
/user_preferences
```

**Bad (mixed):**
```
/calendarEvents     # camelCase in URLs is uncommon
/user-preferences   # Inconsistent with above
```

### Plural Nouns for Collections
- Use plural nouns for resource endpoints
- Singular for single-resource operations

```
GET /events          # Collection
GET /events/123      # Single resource
```

### Nested Resources
- Limit nesting depth to 2-3 levels maximum
- Use query parameters for complex relationships

**Good:**
```
GET /users/:userId/calendars           # 2 levels
GET /users/:userId/calendars/:calendarId
```

**Bad:**
```
GET /users/:userId/calendars/:calendarId/events/:eventId/attendees/:attendeeId
# Too deep, hard to maintain
```

**Better:**
```
GET /attendees/:attendeeId             # Flat structure
GET /events?calendarId=123&userId=456  # Query parameters
```

---

## Query Parameters

### Use for Filtering, Sorting, Pagination
- Use query parameters rather than creating separate endpoints

**Good:**
```
GET /events?date=2026-02-16                  # Filter
GET /events?sort=startTime&order=desc        # Sort
GET /events?page=2&limit=50                  # Pagination
GET /events?search=standup&attendee=john     # Search
```

**Bad:**
```
GET /events/by-date/2026-02-16
GET /events/sorted-by-start-time
GET /events/page-2
```

### Standard Query Parameters
- `page` - Page number (1-indexed)
- `limit` - Items per page (default: 50, max: 100)
- `sort` - Field to sort by
- `order` - Sort direction (`asc` or `desc`)
- `search` - Full-text search query
- `filter[field]` - Filter by field value

---

## Versioning

### Why Version?
- Manage breaking changes without disrupting existing clients
- Allow gradual migration to new API versions

### Versioning Strategies

**1. URL Path (Recommended):**
```
GET /v1/events
GET /v2/events
```
Pros: Clear, easy to route
Cons: Clutters URLs

**2. Header-Based:**
```
GET /events
Accept: application/vnd.api+json; version=1
```
Pros: Clean URLs
Cons: Harder to test (need custom headers)

**3. Query Parameter:**
```
GET /events?version=1
```
Pros: Simple
Cons: Easy to forget, mixes with other query params

### Breaking Changes
Document what constitutes a breaking change:
- Removing or renaming fields
- Changing field types
- Changing required/optional status
- Changing error codes

### Non-Breaking Changes
Safe to make in existing versions:
- Adding new fields (clients should ignore unknown fields)
- Adding new endpoints
- Adding optional parameters
- Relaxing validation

---

## HTTP Status Codes

### Success Codes

| Code | Status | When to Use |
|------|--------|-------------|
| **200** | OK | Successful GET, PUT, PATCH (with body) |
| **201** | Created | Successful POST creating a resource |
| **204** | No Content | Successful DELETE or POST with no response body |

**Example:**
```typescript
// 200 OK
app.get('/events/:id', async (c) => {
  const event = await getEvent(c.req.param('id'));
  return c.json(event, 200);
});

// 201 Created
app.post('/events', async (c) => {
  const event = await createEvent(c.req.json());
  return c.json(event, 201);
});

// 204 No Content
app.delete('/events/:id', async (c) => {
  await deleteEvent(c.req.param('id'));
  return c.body(null, 204);
});
```

### Client Error Codes

| Code | Status | When to Use |
|------|--------|-------------|
| **400** | Bad Request | Invalid input, validation errors |
| **401** | Unauthorized | Missing or invalid authentication |
| **403** | Forbidden | Authenticated but lacks permission |
| **404** | Not Found | Resource doesn't exist |
| **409** | Conflict | Resource state conflict |
| **422** | Unprocessable Entity | Validation errors (semantic) |
| **429** | Too Many Requests | Rate limit exceeded |

**Example:**
```typescript
// 400 Bad Request
if (!isValidEmail(email)) {
  return c.json({ error: 'Invalid email format' }, 400);
}

// 401 Unauthorized
if (!tokens) {
  return c.json({
    error: 'Authentication required',
    authUrl: '/google/login'
  }, 401);
}

// 403 Forbidden
if (!hasPermission(userId, resourceId)) {
  return c.json({ error: 'Access denied' }, 403);
}

// 404 Not Found
if (!event) {
  return c.json({ error: 'Event not found' }, 404);
}

// 429 Too Many Requests
if (isRateLimited(userId)) {
  return c.json({
    error: 'Rate limit exceeded',
    retryAfter: 60
  }, 429);
}
```

### Server Error Codes

| Code | Status | When to Use |
|------|--------|-------------|
| **500** | Internal Server Error | Unexpected server error |
| **502** | Bad Gateway | Upstream service error |
| **503** | Service Unavailable | Temporary service outage |

---

## Request/Response Format

### Content-Type
- Use `application/json` for API requests and responses
- Set `Content-Type` header explicitly

### Request Body (POST/PUT/PATCH)
```json
POST /events
Content-Type: application/json

{
  "summary": "Team Meeting",
  "start": "2026-02-16T10:00:00Z",
  "end": "2026-02-16T11:00:00Z",
  "attendees": ["user@example.com"]
}
```

### Response Body (Success)
```json
{
  "id": "event-123",
  "summary": "Team Meeting",
  "start": "2026-02-16T10:00:00Z",
  "end": "2026-02-16T11:00:00Z",
  "attendees": ["user@example.com"],
  "createdAt": "2026-02-16T09:30:00Z"
}
```

### Error Response Format
Consistent error structure:

```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}
```

---

## Pagination

### Offset-Based Pagination
```
GET /events?page=2&limit=50
```

**Response:**
```json
{
  "data": [ ... ],
  "pagination": {
    "page": 2,
    "limit": 50,
    "total": 342,
    "totalPages": 7,
    "hasNext": true,
    "hasPrev": true
  }
}
```

### Cursor-Based Pagination
More efficient for large datasets:

```
GET /events?cursor=abc123&limit=50
```

**Response:**
```json
{
  "data": [ ... ],
  "pagination": {
    "nextCursor": "def456",
    "prevCursor": "xyz789",
    "hasMore": true
  }
}
```

---

## Rate Limiting

### Rate Limit Headers
Include rate limit information in response headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1609459200
```

**Hono Example:**
```typescript
app.use(async (c, next) => {
  const userId = c.get('userId');
  const rateLimit = await checkRateLimit(userId);

  c.header('X-RateLimit-Limit', rateLimit.limit.toString());
  c.header('X-RateLimit-Remaining', rateLimit.remaining.toString());
  c.header('X-RateLimit-Reset', rateLimit.resetAt.toString());

  if (rateLimit.remaining === 0) {
    return c.json({ error: 'Rate limit exceeded' }, 429);
  }

  await next();
});
```

---

## Security

### Authentication
- Use OAuth 2.0 for user authentication
- Use API keys for service-to-service authentication
- Never pass credentials in URLs (use headers)

**Example (Bearer Token):**
```
GET /events
Authorization: Bearer <access-token>
```

### CORS
- Configure CORS headers appropriately
- Don't use `Access-Control-Allow-Origin: *` in production (specify allowed origins)

### Input Validation
- Validate all input (body, query params, path params)
- Use schema validation libraries (e.g., Zod)

```typescript
import { z } from 'zod';

const createEventSchema = z.object({
  summary: z.string().min(1).max(255),
  start: z.string().datetime(),
  end: z.string().datetime(),
  attendees: z.array(z.string().email()).optional()
});

app.post('/events', async (c) => {
  const body = await c.req.json();
  const validated = createEventSchema.parse(body);  // Throws if invalid
  // ... create event
});
```

---

## Documentation

### OpenAPI/Swagger
- Document your API with OpenAPI specification
- Generate interactive documentation

### Example Endpoint Documentation
```yaml
/events:
  get:
    summary: List calendar events
    parameters:
      - name: date
        in: query
        schema:
          type: string
        description: Filter by date (YYYY-MM-DD)
    responses:
      200:
        description: List of events
        content:
          application/json:
            schema:
              type: array
              items:
                $ref: '#/components/schemas/Event'
```

---

## Further Reading

- **Agent OS Standards:** https://buildermethods.com/agent-os
- **REST API Best Practices:** https://restfulapi.net/
- **OpenAPI Specification:** https://swagger.io/specification/
- **HTTP Status Codes:** https://developer.mozilla.org/en-US/docs/Web/HTTP/Status

---

*Last Updated: 2026-02-16*
