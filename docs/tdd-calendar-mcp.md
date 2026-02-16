# TDD: Google Calendar MCP Server

## 0. Metadata

| Attribute | Details |
| :--- | :--- |
| **PRD** | `docs/prd-calendar-mcp.md` |
| **Status** | 🟡 Draft |
| **Tech Lead** | Geoff (Sense and Motion) |
| **Architecture Diagram** | `docs/arch-calendar-mcp.mmd` |
| **Reference Implementation** | `~/dev/gdoc-comments/` |
| **Standards** | None defined yet (will follow gdoc-comments patterns) |

---

## 1. Technology Choices

| Category | Choice | Rationale | Alternatives Considered |
| :--- | :--- | :--- | :--- |
| **Runtime** | Cloudflare Workers | Edge deployment, fast global access, serverless scaling, 50ms CPU on free tier sufficient for API proxying | AWS Lambda (higher cold start latency), local Node.js server (requires hosting/maintenance) |
| **Framework** | Hono v4 | Lightweight (12KB), Workers-optimized, clean routing API, proven in gdoc-comments | Express (too heavy for Workers), native fetch routing (verbose) |
| **Language** | TypeScript 5.9+ | Type safety for API contracts, better DX, standard for Workers projects | JavaScript (loses type safety), Rust (overkill for API proxy) |
| **MCP SDK** | `@modelcontextprotocol/sdk` | Official MCP implementation, provides server primitives and tool definitions | Custom MCP implementation (reinventing wheel) |
| **OAuth Provider** | `@cloudflare/workers-oauth-provider` v0.2+ | Handles MCP OAuth flow, Durable Object integration, proven in gdoc-comments | Custom OAuth (complex, error-prone) |
| **MCP Agent** | `agents` package (McpAgent) | Provides Durable Object base class for MCP servers, session management built-in | Manual Durable Object setup (more boilerplate) |
| **Storage** | Cloudflare KV | Serverless key-value store, globally replicated, perfect for per-user tokens | D1 (overkill for simple key-value), Durable Object storage (limited API) |
| **Encryption** | Web Crypto API (SubtleCrypto) | Built into Workers runtime, AES-256-GCM support, zero dependencies | Node crypto (not available in Workers), third-party libs (bundle bloat) |
| **Validation** | Zod v4+ | Runtime type validation for MCP tool parameters and API responses, excellent TypeScript integration | Joi (heavier), manual validation (error-prone) |
| **Package Manager** | npm | Standard, compatible with wrangler, used by reference project | pnpm (adds complexity), yarn (unnecessary) |
| **Deployment** | Wrangler CLI | Official Cloudflare Workers deployment tool, handles KV namespaces, secrets, and worker uploads | Manual API calls (tedious), Terraform (overkill) |
| **Build Tool** | Wrangler (esbuild) | Zero-config bundling for Workers, tree-shaking, TypeScript support built-in | Webpack (slow), Rollup (manual config) |

---

## 2. Architecture Overview

### Components

**1. MCP Server (Durable Object: `CalendarMCP`)**
- **Responsibility:** Expose MCP tools for calendar operations, manage user sessions
- **Public Interface:** 7 MCP tools (list_events, get_event, search_events, get_free_busy, create_event, move_event, calendar_auth_status)
- **Internal:** Token retrieval, decryption, Google API calls, error formatting
- **Lifecycle:** One instance per MCP connection, initialized via McpAgent base class

**2. Session Validator**
- **Responsibility:** Ensure requesting user owns the token being used
- **Public Interface:** `validateSession(userEmail: string, encryptedToken: EncryptedToken): boolean`
- **Internal:** HMAC comparison of user IDs, audit logging
- **Boundary:** Called synchronously before every Google API call

**3. Token Manager**
- **Responsibility:** Encrypt/decrypt Google OAuth tokens using Cloudflare Secrets
- **Public Interface:**
  - `encrypt(tokens: GoogleTokens, userId: string): Promise<EncryptedToken>`
  - `decrypt(encryptedToken: EncryptedToken): Promise<GoogleTokens>`
- **Internal:** AES-256-GCM via Web Crypto API, IV generation, HMAC key derivation
- **Boundary:** Called synchronously for all KV read/write operations

**4. Google OAuth Routes (Hono App)**
- **Responsibility:** Handle OAuth 2.0 flow for Google Calendar API access
- **Routes:**
  - `GET /google/auth?user={email}` - Redirect to Google consent
  - `GET /google/callback` - Exchange code for tokens, encrypt and store
  - `GET /google/status?user={email}` - Debug endpoint for token status
- **Boundary:** Browser redirects (async), KV writes (async)

**5. MCP OAuth Routes (Hono App)**
- **Responsibility:** Handle MCP client authentication (Claude Desktop)
- **Routes:**
  - `GET /authorize` - Authorization consent screen
  - `POST /approve` - Complete authorization, attach user email to session
  - `POST /token` - Token exchange (handled by OAuthProvider)
- **Boundary:** MCP client HTTP calls

**6. Google Calendar API Client**
- **Responsibility:** Make authenticated requests to Google Calendar API
- **Public Interface:**
  - `listEvents(accessToken, params): Promise<Event[]>`
  - `getEvent(accessToken, eventId): Promise<Event>`
  - `createEvent(accessToken, eventData): Promise<Event>`
  - `updateEvent(accessToken, eventId, updates): Promise<Event>`
  - `freebusy(accessToken, timeRange): Promise<FreeBusyResponse>`
- **Internal:** Fetch calls with bearer token, error parsing, pagination
- **Boundary:** HTTPS to `https://www.googleapis.com/calendar/v3`

### Data Flow: Querying Events

```
User asks Claude: "What meetings do I have this week?"
          ↓
Claude Desktop → MCP Server (/mcp endpoint)
          ↓
MCP Tool: list_events(date_range: "next 7 days")
          ↓
Extract user email from MCP session props (this.props.userEmail)
          ↓
Compute KV key: google_tokens:${HMAC-SHA256(userEmail)}
          ↓
Fetch encrypted token from KV
          ↓
Session Validator: Verify HMAC(userEmail) matches token's user_id_hash
          ↓
Token Manager: Decrypt token using TOKEN_ENCRYPTION_KEY from Secrets
          ↓
Check token expiry: if < 5 min, refresh via Google OAuth
          ↓
Call Google Calendar API: GET /calendar/v3/calendars/{id}/events
          ↓
Parse response, expand recurring events, format results
          ↓
Return formatted text to Claude
          ↓
Claude presents to user: "You have 5 meetings: ..."
```

### Data Flow: First-Time Authorization

```
User connects MCP in Claude Desktop
          ↓
MCP OAuth: User enters email, completes /authorize flow
          ↓
Email stored in session props
          ↓
User tries to use calendar tool
          ↓
Tool checks KV for google_tokens:{HMAC(email)} → not found
          ↓
Return auth URL: https://.../google/auth?user={email}
          ↓
User opens URL in browser
          ↓
Google OAuth redirect to consent screen
          ↓
User approves → Google callback with authorization code
          ↓
Exchange code for access_token + refresh_token
          ↓
Token Manager encrypts tokens with user_id embedded
          ↓
Store encrypted token in KV: google_tokens:{HMAC(email)}
          ↓
Show success page
          ↓
User returns to Claude, tool now has tokens
```

### Process Boundaries

- **MCP Server Durable Object** runs in a single Worker execution context per session
- **Hono routes** are stateless, handle HTTP redirects and form posts
- **KV storage** is eventually consistent (typically <1s globally)
- **Google API calls** are external HTTPS (rate limited: 1000 req/100s per user)
- **Encryption/Decryption** is synchronous (SubtleCrypto is async but fast: <1ms)

---

## 3. Data Models

### EncryptedToken (stored in KV)

```typescript
{
  iv: string,              // Base64-encoded 12-byte initialization vector
  ciphertext: string,      // Base64-encoded AES-256-GCM encrypted payload
  tag: string,             // Base64-encoded 16-byte authentication tag
  user_id_hash: string,    // HMAC-SHA256(user_email) for validation (32 bytes hex)
  created_at: number,      // Unix timestamp (milliseconds)
  expires_at: number       // Unix timestamp (milliseconds) - copied from decrypted data for quick checks
}
```

**KV Key:** `google_tokens:${HMAC-SHA256(user_email)}`
**Constraints:**
- `iv` must be unique per encryption (randomly generated)
- `user_id_hash` must match requesting user's HMAC before decryption
- `expires_at` should be checked before attempting decryption
- Total KV value size: ~500 bytes (well under 25MB limit)

---

### GoogleTokens (decrypted payload)

```typescript
{
  access_token: string,    // Google OAuth access token (valid ~1 hour)
  refresh_token: string,   // Google OAuth refresh token (valid until revoked)
  expires_at: number,      // Unix timestamp (milliseconds) when access_token expires
  scope: string,           // OAuth scope granted (should be "https://www.googleapis.com/auth/calendar")
  user_email: string,      // Google account email (for logging/debugging)
  user_id: string          // MCP user identity (email from MCP session)
}
```

**Constraints:**
- `access_token` expires typically in 3600 seconds
- `refresh_token` should be treated as highly sensitive (never logged)
- `user_id` must match MCP session identity
- `scope` must include `calendar` for write operations

---

### CalendarEvent (Google Calendar API response, normalized)

```typescript
{
  id: string,                      // Google event ID
  summary: string,                 // Event title
  description?: string,            // Event notes/body
  start: {
    dateTime?: string,             // ISO 8601 with timezone (e.g., "2026-02-20T10:00:00-08:00")
    date?: string,                 // All-day events: YYYY-MM-DD
    timeZone?: string              // IANA timezone (e.g., "America/Vancouver")
  },
  end: {
    dateTime?: string,
    date?: string,
    timeZone?: string
  },
  attendees?: Array<{
    email: string,
    displayName?: string,
    responseStatus?: "accepted" | "declined" | "tentative" | "needsAction"
  }>,
  location?: string,               // Free-text location
  organizer?: {
    email: string,
    displayName?: string,
    self?: boolean                 // True if user is organizer
  },
  calendarId: string,              // Which calendar this event belongs to
  calendarName?: string,           // Human-readable calendar name (fetched separately)
  recurringEventId?: string,       // If this is an instance of a recurring event
  recurrence?: string[],           // RRULE strings (only for series master)
  status: "confirmed" | "tentative" | "cancelled",
  htmlLink: string                 // Direct link to event in Google Calendar
}
```

**Relationships:**
- Each event belongs to one calendar (many-to-one)
- Recurring events: instances have `recurringEventId` pointing to master
- Attendees are separate entities (many-to-many via event)

**Constraints:**
- Either `start.dateTime` or `start.date` must be present (not both)
- `end` must be after `start`
- `id` is unique per calendar, not globally unique

---

### Calendar (metadata from Google Calendar API)

```typescript
{
  id: string,                      // Calendar ID (email-like: "primary" or "user@gmail.com")
  summary: string,                 // Calendar name/title
  description?: string,            // Calendar description
  timeZone: string,                // Default timezone for events (IANA format)
  primary?: boolean,               // True for user's primary calendar
  accessRole: "owner" | "writer" | "reader" | "freeBusyReader"
}
```

**Constraints:**
- User can have 1 primary calendar and N secondary calendars
- Write operations require `accessRole` = "owner" or "writer"
- Special calendar ID "primary" always refers to user's main calendar

---

### FreeBusyResponse (Google Calendar API format)

```typescript
{
  calendars: {
    [calendarId: string]: {
      busy: Array<{
        start: string,             // ISO 8601 datetime
        end: string                // ISO 8601 datetime
      }>,
      errors?: Array<{
        domain: string,
        reason: string
      }>
    }
  },
  timeMin: string,                 // Query start time (ISO 8601)
  timeMax: string                  // Query end time (ISO 8601)
}
```

---

### MCP Session Props (passed from OAuth authorization)

```typescript
{
  userEmail: string                // User's email from MCP authorization form
}
```

**Constraints:**
- `userEmail` is set during MCP OAuth approval
- Used as the primary user identity throughout the system
- Must be present for all tool calls (validated at tool entry)

---

## 4. Interface Contracts

### MCP Tools

All tools return `{ content: [{ type: "text", text: string }] }` on success or error.

---

#### `list_events`

Retrieve calendar events with flexible filtering.

**Parameters:**
```typescript
{
  date_range?: string,             // Examples: "today", "tomorrow", "next 7 days", "2026-02-20 to 2026-02-27"
                                   // Default: "next 7 days"
  calendar_id?: string,            // Specific calendar ID, or omit for all calendars
  keyword?: string,                // Search term for title/description
  attendee?: string                // Filter by attendee email or name
}
```

**Returns:**
```typescript
{
  content: [{
    type: "text",
    text: "Found 5 events:\n\n1. Team Standup (Feb 20, 10:00 AM - 10:30 AM)\n..."
  }]
}
```

**Errors:**
- "Google account not connected. Please visit {url}..." (no tokens)
- "Google token expired and refresh failed. Please visit {url}..." (refresh failed)
- "Error fetching events: {error}" (Google API error)

---

#### `get_event`

Get full details for a specific event.

**Parameters:**
```typescript
{
  event_id: string,                // Google Calendar event ID
  calendar_id?: string             // Optional: which calendar (defaults to "primary")
}
```

**Returns:**
```typescript
{
  content: [{
    type: "text",
    text: "Event: Team Standup\nStart: Feb 20, 2026 10:00 AM PST\n..."
  }]
}
```

**Errors:**
- "Event not found" (404 from Google)
- "Error fetching event: {error}" (Google API error)

---

#### `search_events`

Search across all calendars by keyword.

**Parameters:**
```typescript
{
  query: string,                   // Search term (matches title and description)
  include_past?: boolean           // Default: false (future only)
}
```

**Returns:**
```typescript
{
  content: [{
    type: "text",
    text: "Found 3 events matching 'Rennie':\n\n1. Rennie 1:1 (Feb 22)..."
  }]
}
```

---

#### `get_free_busy`

Check user's availability.

**Parameters:**
```typescript
{
  start_time: string,              // ISO 8601 datetime (e.g., "2026-02-20T09:00:00-08:00")
  end_time: string,                // ISO 8601 datetime
  calendar_ids?: string[]          // Optional: specific calendars (defaults to all)
}
```

**Returns:**
```typescript
{
  content: [{
    type: "text",
    text: "Busy times:\n- Feb 20, 10:00 AM - 10:30 AM\n- Feb 20, 2:00 PM - 3:00 PM"
  }]
}
```

---

#### `create_event`

Create a new calendar event.

**Parameters:**
```typescript
{
  title: string,                   // Event summary (required)
  start: string,                   // ISO 8601 datetime
  end: string,                     // ISO 8601 datetime
  calendar_id?: string,            // Default: "primary"
  attendees?: string[],            // Array of email addresses
  location?: string,               // Free-text location
  description?: string             // Event notes/body
}
```

**Returns:**
```typescript
{
  content: [{
    type: "text",
    text: "Event created: Team Workshop (ID: abc123xyz)\nLink: https://calendar.google.com/..."
  }]
}
```

**Errors:**
- "Invalid date range: end must be after start"
- "Permission denied: cannot write to calendar {id}"

---

#### `move_event`

Reschedule an existing event.

**Parameters:**
```typescript
{
  event_id: string,                // Google Calendar event ID
  new_start: string,               // ISO 8601 datetime
  new_end: string,                 // ISO 8601 datetime
  calendar_id?: string             // Default: "primary"
}
```

**Returns:**
```typescript
{
  content: [{
    type: "text",
    text: "Event rescheduled: Team Standup now on Feb 21, 10:00 AM - 10:30 AM"
  }]
}
```

---

#### `calendar_auth_status`

Check if Google account is connected.

**Parameters:** (none)

**Returns:**
```typescript
{
  content: [{
    type: "text",
    text: "Google account is connected for user@example.com. Token valid for ~45 minutes."
  }]
}
```

---

### Google Calendar API Endpoints

All requests include `Authorization: Bearer {access_token}` header.

---

#### List Events

```
GET /calendar/v3/calendars/{calendarId}/events
Query Parameters:
  - timeMin: ISO 8601 datetime (default: now)
  - timeMax: ISO 8601 datetime
  - q: search query (optional)
  - maxResults: integer (default: 250, max: 2500)
  - pageToken: string for pagination
  - singleEvents: true (expand recurring events)
  - orderBy: "startTime" (requires singleEvents=true)

Response:
{
  items: CalendarEvent[],
  nextPageToken?: string
}

Errors:
  - 401: Invalid credentials (token expired)
  - 403: Forbidden (no access to calendar)
  - 404: Calendar not found
```

---

#### Get Event

```
GET /calendar/v3/calendars/{calendarId}/events/{eventId}

Response: CalendarEvent

Errors:
  - 404: Event not found
```

---

#### Create Event

```
POST /calendar/v3/calendars/{calendarId}/events
Body: CalendarEvent (subset: summary, start, end, attendees, location, description)

Response: CalendarEvent (created)

Errors:
  - 400: Invalid event data
  - 403: Forbidden (insufficient permissions)
```

---

#### Update Event

```
PATCH /calendar/v3/calendars/{calendarId}/events/{eventId}
Body: Partial<CalendarEvent> (only fields to update)

Response: CalendarEvent (updated)

Errors:
  - 404: Event not found
  - 409: Conflict (event modified since last fetch)
```

---

#### Free/Busy Query

```
POST /calendar/v3/freeBusy
Body:
{
  timeMin: string (ISO 8601),
  timeMax: string (ISO 8601),
  items: [{ id: calendarId }, ...]
}

Response: FreeBusyResponse

Errors:
  - 400: Invalid time range
```

---

#### List Calendars

```
GET /calendar/v3/users/me/calendarList

Response:
{
  items: Calendar[]
}
```

---

### Internal Interfaces

#### Token Manager

```typescript
class TokenManager {
  constructor(
    encryptionKey: CryptoKey,
    hmacKey: CryptoKey
  )

  async encrypt(
    tokens: GoogleTokens,
    userId: string
  ): Promise<EncryptedToken>
  // Throws: EncryptionError

  async decrypt(
    encryptedToken: EncryptedToken
  ): Promise<GoogleTokens>
  // Throws: DecryptionError, AuthenticationError (invalid tag)
}
```

---

#### Session Validator

```typescript
function validateSession(
  requestingUserId: string,
  encryptedToken: EncryptedToken,
  hmacKey: CryptoKey
): Promise<boolean>
// Returns false if user_id_hash doesn't match HMAC(requestingUserId)
// Logs security event if validation fails
```

---

## 5. Directory Structure

Following gdoc-comments reference implementation:

```
calendar-mcp/
  src/
    index.ts              — MCP server (CalendarMCP class), tool definitions, token refresh logic
    app.ts                — Hono routes for Google OAuth and MCP OAuth (/google/*, /authorize, /approve)
    utils.ts              — HTML rendering helpers for OAuth screens
    crypto.ts             — Token encryption/decryption (TokenManager class)
    calendar-api.ts       — Google Calendar API client (listEvents, createEvent, etc.)
    session.ts            — Session validation utilities
    types.ts              — Shared TypeScript types (GoogleTokens, CalendarEvent, etc.)
    env.d.ts              — Cloudflare Workers environment type definitions
  tests/
    crypto.test.ts        — Token encryption/decryption unit tests
    session.test.ts       — Session validation tests
  docs/
    prd-calendar-mcp.md   — Product requirements
    tdd-calendar-mcp.md   — This document
    arch-calendar-mcp.mmd — Mermaid architecture diagram
  process/                — Development process templates
  scripts/
    setup.sh              — Automated GCP + Cloudflare setup (similar to gdoc-comments)
    teardown.sh           — Cleanup script
  static/                 — Static assets (CSS for OAuth pages)
  wrangler.jsonc          — Cloudflare Worker configuration
  package.json            — Dependencies and scripts
  tsconfig.json           — TypeScript configuration
  .gitignore              — Ignore node_modules, .env, etc.
  README.md               — Setup instructions and usage guide
```

**Rationale:**
- **Group by concern, not by type:** `crypto.ts` contains all encryption logic, `calendar-api.ts` contains all Google API calls
- **Flat src/ structure:** Small project doesn't warrant nested directories
- **Separate tests/:** Mirrors src/ structure for clarity
- **Scripts for automation:** Setup should be one command (following gdoc-comments success)

---

## 6. Key Implementation Decisions

### Decision: AES-256-GCM Encryption with Web Crypto API

**Decision:** Use Web Crypto API's `SubtleCrypto.encrypt()` with AES-256-GCM mode for token encryption.

**Rationale:**
- Built into Cloudflare Workers runtime (zero bundle size)
- GCM mode provides authenticated encryption (confidentiality + integrity)
- NIST-approved, FIPS 140-2 compliant
- Fast (hardware-accelerated in Workers)

**Guidance for implementers:**
```typescript
// Generate encryption key from Cloudflare Secret
const keyMaterial = await crypto.subtle.importKey(
  "raw",
  hexToBytes(env.TOKEN_ENCRYPTION_KEY), // 32-byte hex string from Secrets
  "AES-GCM",
  false,
  ["encrypt", "decrypt"]
);

// Encrypt
const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
const encrypted = await crypto.subtle.encrypt(
  { name: "AES-GCM", iv, tagLength: 128 },
  keyMaterial,
  textEncoder.encode(JSON.stringify(tokens))
);

// Result includes authentication tag automatically
```

**Pitfalls to avoid:**
- Never reuse IVs (always generate random 12 bytes per encryption)
- Store IV alongside ciphertext (needed for decryption)
- Don't truncate the authentication tag (use full 128 bits)

---

### Decision: Two-Key System (Encryption + HMAC)

**Decision:** Use separate keys for token encryption (AES) and KV key generation (HMAC).

**Rationale:**
- **Encryption key** protects token confidentiality (never use for other purposes)
- **HMAC key** creates non-reversible, non-enumerable KV keys
- Key separation follows cryptographic best practices (single-purpose keys)
- If HMAC key leaks, tokens remain encrypted; if encryption key leaks, KV keys remain unpredictable

**Guidance:**
```typescript
// Cloudflare Secrets:
// - TOKEN_ENCRYPTION_KEY: 64-char hex (32 bytes)
// - TOKEN_HMAC_KEY: 64-char hex (32 bytes)

// Generate keys once using: node -e "console.log(crypto.randomBytes(32).toString('hex'))"

// KV key generation
async function computeKVKey(userEmail: string, hmacKey: CryptoKey): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    hmacKey,
    new TextEncoder().encode(userEmail)
  );
  const hex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `google_tokens:${hex}`;
}
```

---

### Decision: Session Validation Before and After Decryption

**Decision:** Validate user identity twice: before KV fetch (via HMAC) and after decryption (via embedded user_id).

**Rationale:**
- **Before fetch:** Prevents unnecessary KV reads for mismatched users
- **After decryption:** Defense-in-depth; even if HMAC is compromised, decrypted payload includes user_id check
- **Audit trail:** Double validation allows logging of any discrepancies (should never happen)

**Guidance:**
```typescript
async function getTokenForUser(userEmail: string): Promise<GoogleTokens> {
  // First validation: HMAC-based KV key
  const kvKey = await computeKVKey(userEmail, hmacKey);
  const encryptedJson = await env.KV.get(kvKey);

  if (!encryptedJson) {
    throw new Error("No token found");
  }

  const encrypted = JSON.parse(encryptedJson);

  // Second validation: Check user_id_hash matches
  const expectedHash = await computeHMAC(userEmail, hmacKey);
  if (encrypted.user_id_hash !== expectedHash) {
    // CRITICAL SECURITY ERROR: Log and reject
    console.error(`Session hijacking attempt: user=${userEmail}, hash mismatch`);
    throw new Error("Session validation failed");
  }

  // Decrypt
  const tokens = await tokenManager.decrypt(encrypted);

  // Third validation: Check embedded user_id
  if (tokens.user_id !== userEmail) {
    console.error(`Token ownership mismatch: expected=${userEmail}, actual=${tokens.user_id}`);
    throw new Error("Token ownership validation failed");
  }

  return tokens;
}
```

---

### Decision: Proactive Token Refresh at 5-Minute Threshold

**Decision:** Refresh Google OAuth tokens when less than 5 minutes remain before expiry.

**Rationale:**
- Google access tokens typically last 1 hour
- Refreshing at 5 minutes provides buffer for slow API calls
- Avoids mid-operation token expiry (better UX)
- 5 minutes is conservative but not wasteful (refresh is cheap: 1 API call)

**Guidance:**
```typescript
async function ensureFreshToken(tokens: GoogleTokens): Promise<GoogleTokens> {
  const timeUntilExpiry = tokens.expires_at - Date.now();
  const REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes

  if (timeUntilExpiry > REFRESH_THRESHOLD) {
    return tokens; // Still fresh
  }

  // Refresh
  const refreshed = await refreshGoogleToken(tokens.refresh_token);
  if (!refreshed) {
    throw new Error("Token refresh failed - re-authorization required");
  }

  // Update KV with new tokens
  const encrypted = await tokenManager.encrypt(refreshed, tokens.user_id);
  const kvKey = await computeKVKey(tokens.user_id, hmacKey);
  await env.KV.put(kvKey, JSON.stringify(encrypted));

  return refreshed;
}
```

---

### Decision: Expand Recurring Events as Separate Instances

**Decision:** Use `singleEvents=true` parameter in Google Calendar API to expand recurring events into individual instances within the date range.

**Rationale:**
- Simpler for LLM to reason about ("weekly 1:1 on Monday" → 4 separate events for a month)
- Avoids complex RRULE parsing (Google handles it)
- Each instance has its own event ID (can be moved independently)
- Include `recurringEventId` in metadata so clients can understand relationships if needed

**Guidance:**
```typescript
// Always use singleEvents=true for list queries
const params = new URLSearchParams({
  timeMin: startDate.toISOString(),
  timeMax: endDate.toISOString(),
  singleEvents: "true",          // Expand recurring events
  orderBy: "startTime",           // Requires singleEvents=true
  maxResults: "250"
});

// Response includes both one-time and recurring instances
// Recurring instances have: recurringEventId (series ID)
```

**Watch out for:**
- Large recurring series (e.g., daily event for years) may hit maxResults limit → use pagination
- Moving a recurring instance may "break" it from the series (Google behavior)

---

### Decision: Multi-Calendar Queries via Parallel Fetches

**Decision:** To list events across all calendars, fetch calendar list first, then query each calendar in parallel using `Promise.all()`.

**Rationale:**
- Google Calendar API has no single endpoint for "all my events" across calendars
- Parallel fetches minimize total latency (n calendars = ~same time as 1 calendar)
- Cloudflare Workers can handle concurrent fetch calls efficiently
- Typical users have 2-5 calendars (not scaling concern)

**Guidance:**
```typescript
async function listAllEvents(accessToken: string, timeMin: string, timeMax: string): Promise<CalendarEvent[]> {
  // Step 1: Get all calendars
  const calendarsResp = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const { items: calendars } = await calendarsResp.json();

  // Step 2: Fetch events from each calendar in parallel
  const eventPromises = calendars.map(cal =>
    fetchEventsForCalendar(accessToken, cal.id, timeMin, timeMax)
  );
  const eventArrays = await Promise.all(eventPromises);

  // Step 3: Flatten and sort by start time
  const allEvents = eventArrays.flat();
  allEvents.sort((a, b) =>
    new Date(a.start.dateTime || a.start.date).getTime() -
    new Date(b.start.dateTime || b.start.date).getTime()
  );

  return allEvents;
}
```

**Watch out for:**
- If one calendar fails, entire query fails → consider `Promise.allSettled()` and partial results
- Rate limiting: 1000 queries per 100 seconds (per user) across all calendars

---

### Decision: Date Range Parsing with Natural Language Support

**Decision:** Support flexible date range inputs like "today", "tomorrow", "next week", "2026-02-20 to 2026-02-27".

**Rationale:**
- LLMs often produce natural language time references
- Better UX than forcing ISO 8601 format
- Small parsing utility (<100 lines) vs. no dependency (date-fns is 200KB)

**Guidance:**
```typescript
function parseDateRange(input: string): { start: Date, end: Date } {
  const now = new Date();

  switch (input.toLowerCase()) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "tomorrow":
      return { start: startOfDay(addDays(now, 1)), end: endOfDay(addDays(now, 1)) };
    case "next 7 days":
      return { start: now, end: addDays(now, 7) };
    // ... etc.
  }

  // Try parsing "YYYY-MM-DD to YYYY-MM-DD"
  const rangeMatch = input.match(/(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/);
  if (rangeMatch) {
    return { start: new Date(rangeMatch[1]), end: new Date(rangeMatch[2]) };
  }

  // Fallback: default to next 7 days
  return { start: now, end: addDays(now, 7) };
}

// Simple date utilities (no dependencies)
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
```

---

### Decision: No Delete Operation (Intentional PRD Constraint)

**Decision:** Do not implement event deletion, per PRD security requirement.

**Rationale:**
- Deleting events is destructive and hard to undo
- Agent operations may misinterpret user intent
- Forces users to manually confirm deletions in Google Calendar UI
- If user needs deletion, they can use Google Calendar directly

**Guidance:**
- Do NOT add a `delete_event` tool
- If user asks to delete via chat, Claude should explain: "I can't delete events for safety reasons. Please delete it manually at [Google Calendar link]."

---

### Decision: Error Messages Include Actionable Next Steps

**Decision:** All errors include specific guidance for user action (auth URL, re-auth URL, Google Calendar link).

**Rationale:**
- Users can self-recover without debugging
- Clear distinction between "not authorized" vs. "token expired" vs. "API error"
- Auth URLs are personalized (include user email)

**Guidance:**
```typescript
// Bad error message:
"Authentication failed"

// Good error message:
"Google account not connected for user@example.com. Please visit https://calendar-mcp.workers.dev/google/auth?user=user@example.com to authorize access to your Google Calendar, then try again."

// Template for errors:
function formatAuthError(userEmail: string, workerUrl: string): string {
  const authUrl = new URL("/google/auth", workerUrl);
  authUrl.searchParams.set("user", userEmail);
  return `Google account not connected for ${userEmail}. Please visit ${authUrl} to authorize access to your Google Calendar, then try again.`;
}
```

---

## 7. Open Questions & PRD Gaps

| # | Question | Impact | Proposed Resolution |
| :--- | :--- | :--- | :--- |
| 1 | Should `list_events` auto-paginate or expose `nextPageToken` to client? | If user has >250 events in date range, results may be incomplete | **Auto-paginate**: Simpler UX, but slow for large result sets. Recommend auto-paginate with max 1000 events, then warn "more events available". |
| 2 | How to handle all-day events in different timezones? | All-day events use `date` field, not `dateTime`. Display format unclear. | **Proposed**: Format as "All day" with date, no timezone. Example: "Team Offsite (All day, Feb 20)" |
| 3 | Should `move_event` allow moving to a different calendar? | PRD doesn't specify. Moving between calendars is delete + recreate. | **Proposed**: No. Keep `move_event` for time-only changes. Moving calendars is complex and error-prone. |
| 4 | What if user has >10 calendars? Parallel fetch may hit Workers CPU limit. | Unlikely but possible for power users with many shared calendars. | **Proposed**: Fetch max 10 calendars in parallel, log warning if more exist. Can optimize later if needed. |
| 5 | Should we cache calendar list? It rarely changes. | Every `list_events` call fetches calendar list (extra API call). | **Proposed**: Yes, cache in KV for 1 hour. Key: `calendar_list:${user_id_hash}`. Reduces API load. |
| 6 | Timezone handling: store events in UTC or user's local timezone? | Google returns events in their native timezone. Display format unclear. | **Proposed**: Return events in their original timezone (as Google provides). Claude can interpret timezones naturally. |
| 7 | Key rotation: how to rotate encryption keys without losing tokens? | If `TOKEN_ENCRYPTION_KEY` changes, all tokens become undecryptable. | **Proposed**: Defer to post-MVP. For MVP, document manual process: users re-authorize if key rotates. Future: support multi-key decryption with key versioning. |

---

## 8. Risk Register

| Risk | Likelihood | Impact | Mitigation |
| :--- | :--- | :--- | :--- |
| **Google API rate limits** (1000 queries/100s per user) | Medium | Medium | Implement exponential backoff with retry. Cache calendar list. Warn users if approaching limit. |
| **KV eventual consistency** causes stale token reads | Low | Low | KV is typically consistent <1s. Token TTL is 1 hour, so staleness is negligible. Document in README. |
| **Web Crypto API decrypt fails** due to corrupted ciphertext | Low | High | Wrap decrypt in try/catch, return auth URL on failure. Log error for monitoring. Instruct user to re-authorize. |
| **Cloudflare Workers CPU timeout** (50ms free tier) | Medium | High | Profile encryption ops (<1ms expected). Multi-calendar parallel fetch is main concern. Limit to 10 calendars initially. Upgrade to paid tier if needed. |
| **Token refresh fails** after long idle period (refresh token revoked) | Medium | Medium | Catch refresh errors gracefully, return re-auth URL. Instruct user: "Your Google authorization expired. Please re-authorize at [URL]." |
| **HMAC key leaked** allows KV key enumeration | Low | High | Store HMAC key in Cloudflare Secrets (encrypted at rest). Never log HMAC key or derived keys. Rotate if compromised. |
| **Encryption key leaked** allows token decryption | Low | Critical | Store encryption key in Cloudflare Secrets. Never log in plaintext. If leaked, rotate key and force all users to re-authorize. |
| **Recurring event edge case:** event series spans >1 year | Low | Low | Google API handles pagination. Document `maxResults` limit. Auto-paginate up to 1000 events. |
| **User has read-only calendar access** but tool tries to create event | Low | Medium | Check `accessRole` from calendar list before write operations. Return clear error: "Cannot create event: read-only access to calendar." |
| **MCP session expires mid-operation** | Low | Medium | MCP OAuth sessions are long-lived (days). If expires, user reconnects MCP in Claude Desktop. Tools return "User identity not available" error. |

---

## Implementation Notes

### Cloudflare Secrets Setup

During deployment, set these secrets via `wrangler secret put`:

```bash
# Generate keys locally:
node -e "console.log(crypto.randomBytes(32).toString('hex'))" # TOKEN_ENCRYPTION_KEY
node -e "console.log(crypto.randomBytes(32).toString('hex'))" # TOKEN_HMAC_KEY

# Set in Cloudflare:
wrangler secret put TOKEN_ENCRYPTION_KEY
wrangler secret put TOKEN_HMAC_KEY
wrangler secret put GOOGLE_CLIENT_ID        # From GCP OAuth credentials
wrangler secret put GOOGLE_CLIENT_SECRET    # From GCP OAuth credentials
wrangler secret put WORKER_URL              # https://calendar-mcp.<subdomain>.workers.dev
```

### KV Namespace Bindings

In `wrangler.jsonc`:

```json
{
  "kv_namespaces": [
    {
      "binding": "OAUTH_KV",
      "id": "<created via wrangler kv namespace create OAUTH_KV>"
    },
    {
      "binding": "GOOGLE_TOKENS_KV",
      "id": "<created via wrangler kv namespace create GOOGLE_TOKENS_KV>"
    }
  ]
}
```

### Testing Strategy

**Unit Tests** (`tests/crypto.test.ts`, `tests/session.test.ts`):
- Encrypt → Decrypt round-trip
- HMAC key derivation consistency
- Session validation (positive and negative cases)

**Integration Tests** (manual, post-deployment):
1. Complete MCP OAuth flow in Claude Desktop
2. Complete Google OAuth flow in browser
3. Call each MCP tool, verify responses
4. Test token refresh (wait 55 minutes or manually expire token in KV)
5. Test multi-user isolation (2 different Google accounts, ensure no cross-access)

**Security Tests**:
1. Inspect KV manually: verify tokens are encrypted (not plaintext JSON)
2. Attempt session hijacking: forge user email, verify rejection
3. Attempt KV key enumeration: verify HMAC keys are non-predictable

---

## Appendix: Reference Code Patterns

### Encryption Utility (Skeleton)

```typescript
// src/crypto.ts
export class TokenManager {
  private encryptionKey: CryptoKey;
  private hmacKey: CryptoKey;

  constructor(encryptionKey: CryptoKey, hmacKey: CryptoKey) {
    this.encryptionKey = encryptionKey;
    this.hmacKey = hmacKey;
  }

  async encrypt(tokens: GoogleTokens, userId: string): Promise<EncryptedToken> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const payload = new TextEncoder().encode(JSON.stringify(tokens));

    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      this.encryptionKey,
      payload
    );

    const userIdHash = await this.computeUserIdHash(userId);

    return {
      iv: base64Encode(iv),
      ciphertext: base64Encode(new Uint8Array(ciphertext)),
      tag: "", // GCM tag is included in ciphertext by SubtleCrypto
      user_id_hash: userIdHash,
      created_at: Date.now(),
      expires_at: tokens.expires_at
    };
  }

  async decrypt(encryptedToken: EncryptedToken): Promise<GoogleTokens> {
    const iv = base64Decode(encryptedToken.iv);
    const ciphertext = base64Decode(encryptedToken.ciphertext);

    const payload = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      this.encryptionKey,
      ciphertext
    );

    const json = new TextDecoder().decode(payload);
    return JSON.parse(json);
  }

  private async computeUserIdHash(userId: string): Promise<string> {
    const signature = await crypto.subtle.sign(
      "HMAC",
      this.hmacKey,
      new TextEncoder().encode(userId)
    );
    return Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
```

---

## Sign-off

This TDD is ready for task decomposition once open questions are resolved.

**Next steps:**
1. Review open questions (Section 7) and make decisions
2. Create GitHub Issues following `process/create-issues.md`
3. Implement in priority order
4. Follow QA process from `process/first-run-qa.md`
