# Session Notes: Google Calendar MCP - 2026-02-15

## Project Overview

Building a **Google Calendar MCP Server** hosted on Cloudflare Workers that enables Claude Desktop (and other MCP clients) to interact with Google Calendar.

**Goal:** Generic, multi-user calendar awareness tool - anyone can add the MCP endpoint URL to their config and authenticate with their own Google account.

**Reference Project:** `~/dev/gdoc-comments/` - Similar architecture (Cloudflare Workers + MCP + Google OAuth + KV storage)

---

## Tasks Completed

### ✅ Task 1: Process Directory Setup

**Location:** `process/`

**What we did:**
- Copied the development process templates from `~/dev/mmv/process/`
- Scrubbed all Mermaid-specific references (it was a coincidence that the source project was building a Mermaid viewer)
- Re-added Mermaid as the **preferred diagramming tool** for this process (in `create-prd.md` and `create-tdd.md`)
- Added release planning/phasing guidance to `process/README.md`

**Files created:**
- `process/README.md` - Process overview and pipeline
- `process/create-prd.md` - PRD generation template
- `process/create-tdd.md` - TDD generation template
- `process/create-issues.md` - GitHub Issues decomposition template
- `process/agent-observability.md` - Agent tracking and metrics
- `process/first-run-qa.md` - 5-layer QA process (BUILD → BOOT → RENDER → FUNCTION → POLISH)

---

### ✅ Task 2: PRD Creation

**Location:** `docs/prd-calendar-mcp.md`

**Structure:** Followed `process/create-prd.md` template (NOT the gdoc-comments PRD structure)

**Key Decisions Documented:**

1. **Cloudflare-Hosted Multi-User Service**
   - Trade-off: Could do local MCP, but hosted = easier distribution
   - Just share endpoint URL, no local installation needed

2. **Google Calendar Only**
   - No Microsoft 365 / Outlook support for MVP
   - Reduces complexity, can add later if needed

3. **Limited Write Operations**
   - ✅ Create events
   - ✅ Move/reschedule events
   - ❌ NO delete (too risky for agent operations)
   - ❌ NO edit descriptions (use external note-taking)

4. **90-Day Historical Window**
   - Can query past 90 days for timeline reconstruction
   - Balances utility with performance

---

## Functional Requirements Summary (10 FRs)

### Authentication & Core Reads
- **FR-001:** Multi-user OAuth (each user = own Google account, tokens in KV)
- **FR-002:** List events with filters (date range, calendar ID, keyword, attendee)
- **FR-003:** Get event details (title, start/end, attendees, location, description, calendar name, recurring metadata)

### Search & Discovery
- **FR-004:** Search events by keyword (title/description)
- **FR-005:** Search events by attendee email
- **FR-006:** Free/busy query (user's own availability only)

### Write Operations
- **FR-007:** Create calendar event
- **FR-008:** Move/reschedule event

### Multi-Calendar Support
- **FR-009:** Auto-detect all calendars (work, personal, shared)
- **FR-010:** Recurring event handling (surface instances in date range)

---

## MCP Tools Defined

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `list_events` | Retrieve events with filters | `date_range`, `calendar_id`, `keyword`, `attendee` |
| `get_event` | Get full details for one event | `event_id` |
| `search_events` | Search by keyword | `query`, `include_past` |
| `get_free_busy` | Check availability | `start_time`, `end_time` |
| `create_event` | Create new event | `title`, `start`, `end`, `calendar_id`, `attendees`, `location`, `description` |
| `move_event` | Reschedule existing event | `event_id`, `new_start`, `new_end` |
| `calendar_auth_status` | Check if Google connected | (none) |

---

## Non-Goals (Explicitly Out of Scope)

1. ❌ Delete events
2. ❌ Edit event descriptions
3. ❌ Attendee management (add/remove invitees, RSVPs)
4. ❌ Event attachments
5. ❌ Calendar sharing/permissions
6. ❌ Other people's free/busy (only user's own availability)
7. ❌ Microsoft 365 / Outlook
8. ❌ Event reminders/notifications (Google Calendar app handles this)
9. ❌ Real-time sync (on-demand fetching only)
10. ❌ Integration with specific systems (e.g., lots-going-on) - this is generic, those are clients

---

## Technical Constraints

### Architecture Stack
- **Runtime:** Cloudflare Workers (no local server)
- **Storage:** Cloudflare KV for token storage (`google_tokens:{email}`)
- **Framework:** Hono for HTTP routes
- **MCP SDK:** `@modelcontextprotocol/sdk`
- **OAuth:** `@cloudflare/workers-oauth-provider` for MCP OAuth

### Google Calendar API
- **Base URL:** `https://www.googleapis.com/calendar/v3`
- **OAuth Scopes:**
  - `calendar.readonly` - Read operations
  - `calendar` - Write operations (includes read)
  - **Decision:** Request `calendar` scope from start to avoid re-auth later

### Cloudflare Limits
- 50ms CPU time on free tier
- Must keep operations fast
- KV eventual consistency

---

## Important Context Notes

### Why Cloudflare vs. Local MCP?

**User's rationale:** "Sharing the skill+CLI is harder than just providing an MCP URL with the endpoint in Cloudflare."

**Distribution advantage:**
- ✅ Users just add endpoint URL to MCP config
- ✅ No local installation, no platform-specific builds
- ✅ Works in Claude Desktop, IDEs, any MCP client
- ✅ Single deployment, everyone benefits from updates
- ✅ Server-side OAuth (cleaner than CLI device flow)

vs. CLI + Skill approach:
- ❌ Users must install CLI tool
- ❌ Users must copy skill to `.claude/skills/`
- ❌ OAuth setup per user, per machine
- ❌ Platform-specific binaries

### Recurring Event Strategy

**Approach:** Treat each instance as standalone in list results

**Why:** Avoids complexity of series management while supporting primary use cases
- Weekly 1:1 on Monday → shows as separate event each Monday in range
- Include `recurringEventId` metadata so clients can understand relationship if needed
- **Watch out for:** Edge cases where this might get us into trouble (note from user)

---

## Security Enhancements (2026-02-15 Follow-up)

### ✅ Added Comprehensive Security Requirements to PRD

**Trigger:** User raised critical concerns about token storage security and multi-user segregation.

**Changes made to `docs/prd-calendar-mcp.md`:**

1. **New Section 4.5: Security Requirements**
   - **SEC-001:** Encrypted token storage (AES-256-GCM, keys in Cloudflare Secrets)
   - **SEC-002:** Provable multi-user segregation (cryptographic isolation, audit logging)
   - **SEC-003:** Token rotation & expiry (proactive refresh, limited lifetime)
   - **SEC-004:** Secure credential transmission (HTTPS, CSRF protection)
   - **SEC-005:** Minimal scope & least privilege (only `calendar` scope)

2. **Updated FR-001 (Multi-User OAuth):**
   - Added encryption at rest requirement (AES-256-GCM)
   - Added Cloudflare Secrets for encryption keys
   - Added cryptographic user identifier for KV keys
   - Added request-time user validation
   - Added guarantee of no cross-account access

3. **Updated Technical Constraints:**
   - Constraint 2: Explicitly mentions encrypted token storage
   - Constraint 3: New - Cloudflare Secrets for encryption keys
   - Constraint 7: Strengthened to "cryptographically isolated"
   - Constraint 9: New - Security-first design with auditability

4. **Expanded Implementation Notes:**
   - KV key format: `google_tokens:{HMAC-SHA256(user_id)}`
   - Encrypted token structure with IV, ciphertext, auth tag
   - Cloudflare Secrets: `TOKEN_ENCRYPTION_KEY`, `TOKEN_HMAC_KEY`
   - Session validation flow (7-step process)
   - Failure modes and security error handling

5. **Added Security Success Criteria:**
   - Encrypted tokens in KV (verified by inspection)
   - Cross-account access prevention (penetration testing)
   - Session hijacking resistance
   - No credential leakage in logs/errors
   - Complete audit trail

**Key Security Decisions:**

- **Cloudflare Secrets vs. KV for Keys:** Encryption keys stored as environment variables (Secrets), never in KV
- **Two-Key System:** Separate keys for token encryption (AES) and KV key generation (HMAC)
- **HMAC-based KV Keys:** Non-predictable, non-enumerable token storage keys
- **Multi-Layer Validation:** User ID validated before KV retrieval AND after decryption
- **Audit Trail:** All token access logged with user IDs for security monitoring

**Impact on TDD:**
- Must design encryption/decryption utilities
- Must define session validation middleware
- Must specify audit logging format and storage
- Must document key rotation procedures
- Must include security testing in QA plan

---

## TDD Creation (2026-02-15 Continued)

### ✅ Task 3: Created TDD (Technical Design Document)

**Location:** `docs/tdd-calendar-mcp.md` + `docs/arch-calendar-mcp.mmd`

**What was created:**

1. **Architecture Diagram** (`docs/arch-calendar-mcp.mmd`)
   - Mermaid diagram showing component boundaries
   - Client → Workers → Storage → Google APIs data flow
   - Highlights encryption/decryption layer and session validation

2. **Comprehensive TDD** following `process/create-tdd.md` template:

   **Section 1: Technology Choices** (11 decisions)
   - Cloudflare Workers, Hono, TypeScript, MCP SDK
   - Web Crypto API for encryption (AES-256-GCM)
   - Zod for validation, KV for storage
   - Each choice includes rationale and rejected alternatives

   **Section 2: Architecture Overview**
   - 6 main components: MCP Server, Session Validator, Token Manager, OAuth Routes, Google API Client
   - Detailed data flows for querying events and first-time auth
   - Process boundaries (sync/async, external calls)

   **Section 3: Data Models**
   - EncryptedToken (KV storage format with IV, ciphertext, tag, user_id_hash)
   - GoogleTokens (decrypted payload)
   - CalendarEvent (normalized from Google API)
   - Calendar, FreeBusyResponse, MCP Session Props
   - All fields documented with types and constraints

   **Section 4: Interface Contracts**
   - 7 MCP tools with full parameter/return specs
   - 6 Google Calendar API endpoints with request/response formats
   - Internal interfaces (TokenManager, SessionValidator)

   **Section 5: Directory Structure**
   - Follows gdoc-comments pattern (flat src/ structure)
   - src/index.ts (MCP server), src/app.ts (Hono routes)
   - src/crypto.ts (encryption), src/calendar-api.ts (Google API client)
   - src/session.ts (validation), src/types.ts (shared types)

   **Section 6: Key Implementation Decisions** (9 decisions)
   - AES-256-GCM encryption with Web Crypto API
   - Two-key system (encryption + HMAC)
   - Session validation before AND after decryption
   - Proactive token refresh at 5-minute threshold
   - Expand recurring events as separate instances
   - Multi-calendar queries via parallel fetches
   - Date range parsing with natural language support
   - No delete operation (intentional security constraint)
   - Error messages include actionable next steps

   **Section 7: Open Questions & PRD Gaps** (7 questions)
   - Auto-pagination strategy for large result sets
   - All-day event timezone handling
   - Move event across calendars (proposed: no)
   - 10+ calendar limit for parallel fetches
   - Calendar list caching strategy
   - Timezone display format
   - Encryption key rotation strategy (deferred to post-MVP)

   **Section 8: Risk Register** (10 risks)
   - Google API rate limits (mitigation: backoff, caching)
   - KV eventual consistency (low impact due to token TTL)
   - Decrypt failures (mitigation: try/catch, re-auth)
   - Cloudflare Workers CPU timeout (mitigation: limit to 10 calendars)
   - Token refresh failures (mitigation: graceful error, re-auth URL)
   - HMAC/encryption key leaks (mitigation: Secrets storage, rotation)
   - Recurring event edge cases
   - Read-only calendar access (check accessRole)

3. **Implementation Guidance**
   - Cloudflare Secrets setup commands
   - KV namespace bindings for wrangler.jsonc
   - Testing strategy (unit, integration, security tests)
   - Reference code patterns for encryption utilities

**Technology Stack Finalized:**
- Runtime: Cloudflare Workers
- Framework: Hono v4
- Language: TypeScript 5.9+
- MCP: @modelcontextprotocol/sdk + agents (McpAgent)
- OAuth: @cloudflare/workers-oauth-provider v0.2+
- Validation: Zod v4+
- Storage: Cloudflare KV (encrypted tokens) + Secrets (keys)
- Encryption: Web Crypto API (SubtleCrypto, AES-256-GCM)
- Deployment: Wrangler CLI

**Key Architectural Decisions:**
- Two separate OAuth flows (MCP OAuth for user identity + Google OAuth for API access)
- Encrypted token storage (AES-256-GCM) with keys in Cloudflare Secrets
- Triple session validation (HMAC before fetch, HMAC after fetch, user_id after decrypt)
- Proactive token refresh (5-min threshold)
- Auto-expand recurring events (singleEvents=true)
- Parallel multi-calendar fetching (Promise.all)

**Security Implementation:**
- Tokens encrypted at rest (never plaintext in KV)
- Non-enumerable KV keys (HMAC-SHA256 of user email)
- Separate keys for encryption and HMAC
- Defense-in-depth validation (3 layers)
- Audit logging for security events
- No cross-user access possible

---

---

## Session Summary (2026-02-15)

### What We Built Today

**Session Goal:** Create PRD and TDD for Google Calendar MCP Server

**What Exists Now:**
1. ✅ **Process templates** (`process/`) - Development pipeline framework
2. ✅ **PRD** (`docs/prd-calendar-mcp.md`) - 10 functional requirements, security model, 7 MCP tools
3. ✅ **Security requirements** (PRD Section 4.5) - 5 security requirements (SEC-001 through SEC-005)
4. ✅ **TDD** (`docs/tdd-calendar-mcp.md`) - Complete technical design (48 pages)
5. ✅ **Architecture diagram** (`docs/arch-calendar-mcp.mmd`) - Mermaid component diagram

**No Code Written Yet** - Still in planning phase

---

## Critical Context for Next Session

### The Product

**What:** Cloudflare Workers-hosted MCP server that connects Claude Desktop to Google Calendar API

**Why Cloudflare vs. Local:** Easier distribution - users just add endpoint URL to MCP config (no local installation)

**Key Constraints:**
- Google Calendar only (no Microsoft 365)
- Limited writes (create + move, NO delete)
- 90-day historical window
- Multi-user with cryptographic isolation

### Security Model (CRITICAL)

**Problem Solved:** User raised concerns about token storage security and cross-user access prevention

**Solution Implemented in PRD/TDD:**
1. **Encrypted token storage** - AES-256-GCM encryption, keys in Cloudflare Secrets (not KV)
2. **Two-key system** - Separate keys for encryption (AES) and KV key generation (HMAC)
3. **Triple validation** - User identity checked 3 times per request:
   - Before KV fetch (HMAC of user email)
   - After KV fetch (compare HMAC in stored token)
   - After decryption (compare user_id in decrypted payload)
4. **Non-enumerable KV keys** - `google_tokens:{HMAC-SHA256(user_email)}` prevents enumeration
5. **Audit logging** - All token access logged with user IDs

**KV Storage Format:**
```typescript
{
  iv: string,              // Random per encryption
  ciphertext: string,      // Encrypted GoogleTokens
  tag: string,             // GCM authentication tag
  user_id_hash: string,    // HMAC(user_email) for validation
  created_at: number,
  expires_at: number
}
```

### Technology Stack

- **Runtime:** Cloudflare Workers
- **Framework:** Hono v4
- **Language:** TypeScript 5.9+
- **MCP:** @modelcontextprotocol/sdk + agents (McpAgent base class)
- **OAuth:** @cloudflare/workers-oauth-provider v0.2+
- **Storage:** Cloudflare KV (tokens) + Secrets (keys)
- **Encryption:** Web Crypto API (SubtleCrypto, AES-256-GCM)
- **Validation:** Zod v4+

### Directory Structure (Planned)

```
src/
  index.ts              — MCP server (CalendarMCP class), 7 tools
  app.ts                — Hono routes for OAuth flows
  crypto.ts             — TokenManager class (encrypt/decrypt)
  calendar-api.ts       — Google Calendar API client
  session.ts            — Session validation utilities
  types.ts              — Shared TypeScript types
  utils.ts              — HTML rendering for OAuth screens
  env.d.ts              — Cloudflare environment types
```

### 7 MCP Tools Defined

1. **list_events** - Query events with filters (date, calendar, keyword, attendee)
2. **get_event** - Get full details for one event
3. **search_events** - Search by keyword across calendars
4. **get_free_busy** - Check user's availability
5. **create_event** - Create new event
6. **move_event** - Reschedule existing event
7. **calendar_auth_status** - Check Google connection status

### Open Questions (TDD Section 7)

**Need decisions before implementation:**

1. **Auto-pagination:** List events with >250 results - auto-fetch all or expose nextPageToken?
   - **Proposed:** Auto-paginate up to 1000 events, then warn

2. **All-day events:** How to display timezone for all-day events?
   - **Proposed:** Format as "All day, Feb 20" (no timezone)

3. **Move across calendars:** Should move_event support changing calendars?
   - **Proposed:** No (complex, error-prone)

4. **10+ calendars:** Limit parallel fetches?
   - **Proposed:** Max 10 calendars in parallel, log warning if more

5. **Calendar list caching:** Cache calendar list in KV?
   - **Proposed:** Yes, cache for 1 hour (reduces API load)

6. **Timezone display:** Store/display in UTC or original timezone?
   - **Proposed:** Return in original timezone (Claude can interpret)

7. **Key rotation:** How to rotate encryption keys without losing tokens?
   - **Proposed:** Defer to post-MVP (users re-auth if rotated)

---

## Next Steps

### 🔜 Task 4: Resolve Open Questions

Review TDD Section 7 open questions and make final decisions.

### 🔜 Task 5: Create GitHub Issues

Use `process/create-issues.md` to decompose TDD into implementation tasks.

### 🔜 Task 6: Implementation

Execute issues in priority order:
1. Project setup (wrangler.jsonc, package.json, tsconfig)
2. Token encryption utilities (src/crypto.ts)
3. Session validation (src/session.ts)
4. Google OAuth routes (src/app.ts)
5. MCP server and tools (src/index.ts)
6. Google Calendar API client (src/calendar-api.ts)
7. Setup automation (scripts/setup.sh)

### 🔜 Task 7: QA

Follow `process/first-run-qa.md` (5-layer QA: BUILD → BOOT → RENDER → FUNCTION → POLISH)

---

**File to create:** `docs/tdd-calendar-mcp.md`

**Template to follow:** `process/create-tdd.md`

**What the TDD needs to define:**

1. **Technology Choices** (with rationale)
   - Runtime, framework, language choices
   - Why each choice vs. alternatives

2. **Architecture Overview**
   - Components and boundaries
   - Data flow (user request → MCP → Google API → response)
   - Mermaid architecture diagram (`docs/arch-calendar-mcp.mmd`)

3. **Data Models**
   - Event schema (fields, types, constraints)
   - Calendar schema
   - Token storage schema in KV

4. **Interface Contracts**
   - Google Calendar API endpoints and responses
   - MCP tool signatures (parameters, return types)
   - Error response formats

5. **Directory Structure**
   - `src/` layout
   - Where MCP tools live vs. OAuth routes vs. utilities

6. **Key Implementation Decisions**
   - OAuth token refresh strategy
   - Error handling patterns
   - Multi-calendar query approach
   - Recurring event expansion logic

7. **Open Questions & PRD Gaps**
   - Flag anything the PRD doesn't address
   - Surface architectural trade-offs needing human decision

8. **Risk Register**
   - Google API rate limits
   - Token refresh edge cases
   - Cloudflare Workers timeout risks

### Reference Implementation

**Study:** `~/dev/gdoc-comments/src/` for patterns:
- `src/index.ts` - MCP server + tools
- `src/app.ts` - Hono routes for Google OAuth
- `src/utils.ts` - HTML rendering helpers
- `wrangler.jsonc` - Cloudflare Worker config

---

## Questions for TDD Phase

Before writing TDD, may need to decide:

1. **Calendar ID vs. "primary"** - How to handle default calendar selection?
2. **Timezone handling** - Store events in UTC? User's local timezone? Both?
3. **Pagination strategy** - Google API returns max 250 events per page; auto-paginate or expose to client?
4. **Error granularity** - How specific should error messages be? (e.g., "Event not found" vs. "403 Forbidden")
5. **Token refresh timing** - Proactive refresh before expiry or on-demand when 401?

---

## Development Pipeline (from process/)

```
create-prd.md  →  create-tdd.md  →  create-issues.md  →  agents execute issues
     |                  |                   |
  WHAT to build      HOW to build it    WHO does what
  (problem, FRs,     (stack, schemas,   (GitHub Issues
   acceptance         contracts, dir     w/ exit criteria)
   criteria)          structure)
```

**Current status:** ✅ PRD complete → 🔜 TDD next → Future: Issues → Implementation → QA

---

## Files Created/Modified This Session

```
/Users/sam/dev/calendar-mcp/
├── process/                              [Created in first session]
│   ├── README.md
│   ├── create-prd.md
│   ├── create-tdd.md
│   ├── create-issues.md
│   ├── agent-observability.md
│   └── first-run-qa.md
├── docs/                                 [Created in first session, expanded today]
│   ├── prd-calendar-mcp.md              [Created, then updated with security requirements]
│   ├── tdd-calendar-mcp.md              [Created today - 48 pages]
│   └── arch-calendar-mcp.mmd            [Created today - Mermaid diagram]
└── SESSION_NOTES.md                      [Updated throughout session]
```

**Total Output:**
- **6** process templates
- **1** PRD (20 pages, 10 FRs, 5 security requirements)
- **1** TDD (48 pages, 9 key decisions, 7 open questions)
- **1** Architecture diagram
- **1** Session notes (this file, ~350 lines)

**What Doesn't Exist Yet:**
- No code (`src/` directory is empty/non-existent)
- No package.json or wrangler.jsonc
- No GitHub issues
- No tests
- No deployment scripts

---

## Key Files to Reference

- **PRD:** `docs/prd-calendar-mcp.md`
- **TDD Template:** `process/create-tdd.md`
- **Reference Project:** `~/dev/gdoc-comments/` (especially README and src/)
- **Original Spec:** `~/dev/lots-going-on/CALENDAR-MCP-SPEC.md` (user's initial vision - note: decided NOT to integrate with lots-going-on, this is generic)

---

## Session Context Window

- Started at ~20k tokens
- Ended at ~96k tokens (48% used)
- Heavy reads: process templates, gdoc-comments PRD, reference files
- Main outputs: 6 process files, 1 PRD, release planning notes

---

## Resumption Checklist

**If resuming in a new session, read these in order:**

1. ✅ **This file first** (`SESSION_NOTES.md`) - Quick context on what's done and what's next
2. ✅ **PRD** (`docs/prd-calendar-mcp.md`) - Product requirements and security model
3. ✅ **TDD** (`docs/tdd-calendar-mcp.md`) - Technical design and implementation decisions
4. 🔜 **Resolve open questions** (TDD Section 7) - Make final decisions on 7 open items
5. 🔜 **Create issues** - Use `process/create-issues.md` to decompose work
6. 🔜 **Start implementation** - Begin with project setup, then encryption utilities

**Quick Start for Next Session:**
- Start here: "I've reviewed SESSION_NOTES.md. Let's resolve the 7 open questions in the TDD."
- Or jump to: "I'm ready to create GitHub issues from the TDD."
- Or deep dive: "Let me start implementing - beginning with project setup."

---

## Notes on User Preferences

- **Name:** Geoff (not "Jeff")
- **Company:** Sense and Motion (abbreviated "Sam", NEVER "S&M")
- **Location:** Vancouver, BC
- **Workflow:** Prefers imperative tense for action ("create the file"), questions for queries
- **Bash pattern:** Multi-line scripts go to `.tmp/agent-<name>.sh` then run via `bash run.sh .tmp/...`
- **Process adherence:** Follow the process/ templates exactly - user designed these for agent-assisted development
