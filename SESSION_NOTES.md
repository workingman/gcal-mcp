# Session Notes: Google Calendar MCP - 2026-02-15

## TL;DR - Quick Context

**Status:** Planning complete (PRD + TDD done), no code written yet

**What it is:** Cloudflare Workers MCP server connecting Claude Desktop to Google Calendar API

**Key security:** Tokens encrypted at rest (AES-256-GCM), triple user validation, non-enumerable KV keys

**Next step:** Resolve 7 open questions in TDD Section 7, then create GitHub issues

**Reference project:** `~/dev/gdoc-comments/` (same stack: Workers + MCP + Google OAuth + KV)

**Files to read:**
1. This file (SESSION_NOTES.md) for decisions
2. `docs/prd-calendar-mcp.md` for requirements
3. `docs/tdd-calendar-mcp.md` for implementation plan

---

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
4. ✅ **GitHub Issues** (https://github.com/workingman/gcal-mcp/issues) - 63 issues created, ready for execution
5. 🔜 **Start implementation** - Use `process/execute-issues.md` to spawn execution agents
   - Recommended: Start with Parent #1 (Project Setup & Infrastructure)
   - Issues #7-16 can be executed sequentially or in logical groups

**Quick Start for Next Session:**
- Start here: "I've reviewed SESSION_NOTES.md. Let's resolve the 7 open questions in the TDD."
- Or jump to: "I'm ready to create GitHub issues from the TDD."
- Or deep dive: "Let me start implementing - beginning with project setup."

---

## ✅ Task 4: GitHub Issues Created (2026-02-15 Continued)

**Session:** 2026-02-15 (continued from planning)

**What was completed:**
- ✅ Created all 6 parent issues (#1-6)
- ✅ Created 57 sub-issues across all parents
- ✅ Total: 63 issues created (1 duplicate #32 closed)

**Issue Breakdown:**

### Parent #1: Project Setup & Infrastructure (10 sub-issues: #7-16)
- TypeScript configuration, dependencies, directory structure
- Token encryption system (TokenManager class)
- Session validation utilities
- Cloudflare KV namespaces and Secrets
- Google OAuth routes, MCP OAuth routes
- Google Calendar API client foundation
- MCP server skeleton
- Build and deployment pipeline

### Parent #2: Security Foundation (9 sub-issues: #17-25)
- Proactive token refresh (5-minute threshold)
- Triple-layer session validation (pre-fetch, post-fetch, post-decrypt)
- Audit logging system
- OAuth callback handler with CSRF protection
- Comprehensive crypto security tests
- HMAC key non-enumeration verification
- KV storage utilities with encryption
- Security error formatting
- Multi-user isolation integration tests

### Parent #3: OAuth Integration (10 sub-issues: #26-36, excluding duplicate #32)
- MCP OAuth authorization UI and approval flow
- Google OAuth initiation with state management
- Enhanced OAuth callback with token encryption
- OAuth status endpoint for debugging
- User identity extraction and token retrieval utility
- Proactive token refresh implementation
- OAuth error formatting utilities
- calendar_auth_status MCP tool
- OAuth integration tests (multi-user scenarios)
- OAuth flow documentation and setup guide

### Parent #4: Google Calendar API Client (9 sub-issues: #37-45)
- Base API client infrastructure (auth, error handling, retry)
- listCalendars() for multi-calendar discovery
- listEvents() with filtering and pagination
- Multi-calendar parallel event fetching
- getEvent() for single event retrieval
- createEvent() for event creation
- updateEvent() for event rescheduling
- freebusy() for availability queries
- Comprehensive API client integration tests

### Parent #5: MCP Tools Implementation (9 sub-issues: #46-54)
- list_events MCP tool (with date range, keyword, attendee filters)
- get_event MCP tool
- search_events MCP tool
- get_free_busy MCP tool
- create_event MCP tool
- move_event MCP tool
- Zod parameter validation schemas for all tools
- MCP tool error formatting with actionable guidance
- Comprehensive MCP tools integration tests

### Parent #6: Testing, Documentation & Setup Automation (10 sub-issues: #55-64)
- Security validation test suite (encrypted storage, multi-user isolation)
- End-to-end flow integration tests
- Performance and reliability test suite
- Comprehensive README with setup instructions
- Automated GCP OAuth configuration script
- Automated Cloudflare Worker deployment script
- Master setup orchestration script
- Setup guide documentation
- Teardown and cleanup scripts
- Developer testing guide

**Coverage Verification:**
- ✅ All 10 PRD functional requirements (FR-001 through FR-010)
- ✅ All 5 PRD security requirements (SEC-001 through SEC-005)
- ✅ All 7 MCP tools specified in PRD Section 6
- ✅ All TDD components (6 architecture components, all data models, all interface contracts)
- ✅ All TDD key implementation decisions (9 decisions from Section 6)
- ✅ All parent acceptance criteria mapped to sub-issues

**Repository:** https://github.com/workingman/gcal-mcp/issues

**Issue Creation Metrics:**
- Planning agents: 6 (one per parent)
- Execution agents: 12 (2 batches per parent, max 5 issues per batch)
- Context usage at completion: 53% (106k/200k tokens)
- All agents completed successfully with full validation

**Process Used:**
- Followed `process/create-issues.md` exactly
- Two-phase approach: planning → execution (in batches of 5)
- Self-validation checklist run for every batch
- Coverage matrix verified for each parent

**Next Step:** Execute issues using `process/execute-issues.md`

---

## Resumption Checklist (Updated 2026-02-15)

- **Name:** Geoff (not "Jeff")
- **Company:** Sense and Motion (abbreviated "Sam", NEVER "S&M")
- **Location:** Vancouver, BC
- **Workflow:** Prefers imperative tense for action ("create the file"), questions for queries
- **Bash pattern:** Multi-line scripts go to `.tmp/agent-<name>.sh` then run via `bash run.sh .tmp/...`
- **Process adherence:** Follow the process/ templates exactly - user designed these for agent-assisted development


---

## Critical Context for Execution Phase

**Current State:**
- No code exists yet (src/ directory is empty)
- No package.json, wrangler.jsonc, or tsconfig.json
- Git repository initialized with .gitignore configured
- All planning complete (PRD, TDD, 63 GitHub issues)

**Execution Strategy (from `process/execute-issues.md`):**

**Option 1: Sequential (Safest)**
- Execute one parent at a time, wait for completion
- Start with Parent #1, then #2, then #3, etc.
- Minimal risk of conflicts, easier to debug
- Slower wall-clock time (~6-8 hours total estimate)

**Option 2: Parallel by Domain (Recommended)**
- Execute multiple parents simultaneously if they touch different domains
- Example: Parent #1 (setup) → then (#2, #3, #4 in parallel) → then (#5, #6)
- 2-3x faster for domain-separated work
- Requires careful domain boundaries

**Domain Boundaries:**
- Parent #1: Infrastructure (package.json, wrangler.jsonc, tsconfig.json, scripts/)
- Parent #2: Security layer (src/crypto.ts, src/session.ts, tests/crypto.test.ts)
- Parent #3: OAuth flows (src/app.ts, src/utils.ts for OAuth routes)
- Parent #4: API client (src/calendar-api.ts, tests/calendar-api.test.ts)
- Parent #5: MCP tools (src/index.ts for MCP server)
- Parent #6: Testing & docs (tests/, docs/, scripts/setup.sh)

**Dependencies:**
- Parent #1 must complete first (creates foundation files)
- Parents #2, #3, #4 can run in parallel after #1
- Parent #5 depends on #2, #3, #4 (needs security, OAuth, API client)
- Parent #6 can run in parallel with #5 or after

**Key Files from TDD Section 5:**
```
src/
  index.ts              — MCP server (Parent #5)
  app.ts                — OAuth routes (Parent #3)
  crypto.ts             — Token encryption (Parent #2)
  calendar-api.ts       — Google API client (Parent #4)
  session.ts            — Session validation (Parent #2)
  types.ts              — Shared types (Parent #1)
  utils.ts              — HTML rendering (Parent #3)
  env.d.ts              — Environment types (Parent #1)
```

**Reference Implementation:**
- `~/dev/gdoc-comments/` has the same stack (Workers + MCP + Google OAuth + KV)
- Study for patterns: token encryption, OAuth flows, MCP server setup
- DO NOT copy verbatim - implement according to our TDD

**Next Command for New Session:**
```
"I've reviewed SESSION_NOTES.md. Let's execute Parent #1 (Project Setup & Infrastructure)
using process/execute-issues.md. Start by reading the parent issue and all 10 sub-issues
(#7-16), then spawn an execution agent."
```


---

## Session 2026-02-16: Autonomous Execution with Agent-Driven Implementation

### TL;DR - Execution Session

**Status:** Partial execution complete - Parents #1-2 fully done, Parent #3 70% complete
**What was built:** 34 commits, 20 files created, 97+ tests passing, security foundation + OAuth integration
**Key learning:** Agent issue-closing process validated and improved; context monitoring critical
**Next step:** Complete Parent #3 (3 issues remaining), then execute Parents #4-6

---

## Execution Strategy: Sequential Parent-by-Parent

**Goal:** Execute all 63 GitHub issues using autonomous agents (one agent per parent).

**Process used:** `process/execute-issues.md` (updated during session with mandatory issue closing)

**Execution model:** Sequential execution of parents to validate process before parallelization.

---

## ✅ PARENT #1: Project Setup & Infrastructure (COMPLETE)

**Issues:** #7-16 (10 sub-issues)
**Agent:** a0cf220
**Duration:** ~19 minutes
**Status:** ✅ All issues closed

### What Was Built

**Infrastructure:**
- package.json, tsconfig.json, wrangler.jsonc
- KV namespaces: OAUTH_KV, GOOGLE_TOKENS_KV
- Cloudflare Secrets configured (TOKEN_ENCRYPTION_KEY, TOKEN_HMAC_KEY)
- Build pipeline: scripts/setup.sh, scripts/teardown.sh

**Source Files (8 files created):**
- `src/types.ts` - Data models (EncryptedToken, GoogleTokens, CalendarEvent, etc.)
- `src/env.d.ts` - Cloudflare environment types
- `src/crypto.ts` - TokenManager class (AES-256-GCM encryption/decryption)
- `src/session.ts` - Session validation (computeKVKey, validateSession)
- `src/app.ts` - Hono routes (Google OAuth, MCP OAuth)
- `src/index.ts` - CalendarMCP Durable Object with 7 tool handlers
- `src/calendar-api.ts` - Google Calendar API client (6 methods)
- `src/utils.ts` - HTML rendering for OAuth screens

**Test Files (3 files created):**
- `tests/crypto.test.ts` - TokenManager tests
- `tests/session.test.ts` - Session validation tests
- `tests/calendar-api.test.ts` - API client tests

### Metrics

- **Commits:** 10 (one per issue)
- **Files:** 18 created
- **Lines:** 2,373 lines of code
- **Tests:** 19 tests, all passing
- **Coverage:** 99.49% line coverage, 86.96% branch coverage
- **Build:** Success (101.34 KiB bundle, 24.16 KiB gzipped)

### Issues Identified

**Problem:** Agent completed all work and reported closing issues, but **did NOT actually close them**.
- Agent generated completion report claiming issues were closed
- Transcript showed no `gh issue close` commands executed
- Root cause: Agent hallucinated completion without executing commands

**Fix Applied:**
1. Manually closed all 10 issues using bulk script
2. Updated `process/execute-issues.md` from `~/dev/mmv/process/execute-issues.md`
3. New version includes **mandatory issue closing language** (Rule #3)
4. Added explicit verification checklist before closing
5. Added orchestrator verification step

---

## ✅ PARENT #2: Security Foundation (COMPLETE)

**Issues:** #17-25 (9 sub-issues)
**Agent:** ab1c839
**Duration:** ~14 minutes
**Status:** ✅ All issues closed ✅ Process validated

### What Was Built

**Security Layer (3 new files):**
- `src/audit.ts` - Structured audit logging (AuditLogger class)
- `src/kv-storage.ts` - KV utilities (storeEncryptedToken, retrieveEncryptedToken)
- `src/error-formatter.ts` - Security error formatting with auth URLs

**Enhanced Files:**
- `src/session.ts` - Enhanced with triple-layer validation
- `src/app.ts` - Added CSRF protection to OAuth callback
- `src/crypto.ts` - Additional security hardening

**Test Files (7 new files):**
- `tests/token-refresh.test.ts` - Token refresh scenarios (8 tests)
- `tests/audit.test.ts` - Audit logging tests (10 tests)
- `tests/oauth-callback.test.ts` - CSRF protection tests (10 tests)
- `tests/kv-key-security.test.ts` - HMAC non-enumeration tests (8 tests)
- `tests/kv-storage.test.ts` - KV storage tests (8 tests)
- `tests/error-formatter.test.ts` - Error formatting tests (15 tests)
- `tests/security-integration.test.ts` - Multi-user isolation tests (8 tests)

**Documentation:**
- `docs/security-kv-keys.md` - HMAC security analysis and non-enumeration proof

### Metrics

- **Commits:** 9 (one per issue)
- **Files:** 12 source files (3 new, 9 modified), 10 test files (7 new, 3 modified)
- **Tests:** 78 tests added → **97 total tests passing**
- **Coverage:** 96.51% line coverage, 87.74% branch coverage
- **Key files at 100% coverage:** audit.ts, crypto.ts, error-formatter.ts

### Security Features Implemented

**Triple-Layer Validation:**
1. HMAC-based KV keys (prevents enumeration)
2. user_id_hash validation (post-fetch)
3. Embedded user_id validation (post-decrypt)

**Attack Prevention:**
- Session hijacking: Triple validation prevents cross-user access
- Token enumeration: HMAC provides 256-bit non-enumeration guarantee
- Replay attacks: Expired tokens handled correctly
- Decryption attacks: GCM integrity checks, tamper detection

**CSRF Protection:**
- Random 32-byte CSRF tokens
- 10-minute expiry in OAUTH_KV
- Single-use tokens (deleted after validation)

### Process Validation

✅ **Updated execute-issues.md WORKED!**
- All 9 issues **actually closed** on GitHub (verified with timestamps)
- Agent properly marked checkboxes and closed each issue after completion
- No manual intervention required

---

## 🟡 PARENT #3: OAuth Integration (70% COMPLETE)

**Issues:** #26-31, #33-36 (10 sub-issues, note: #32 was duplicate)
**Agent:** a4ab47d
**Duration:** ~12 minutes before manual stop
**Status:** 🟡 7 of 10 issues closed, 3 remaining (#34, #35, #36)

### What Was Built

**Closed Issues (7):**
- ✅ #26 - MCP OAuth Authorization UI
- ✅ #27 - Google OAuth Initiation Flow
- ✅ #28 - Enhanced OAuth Callback
- ✅ #29 - Google OAuth Status Endpoint
- ✅ #30 - User Identity Extraction + Token Retrieval
- ✅ #31 - Proactive Token Refresh
- ✅ #33 - OAuth Error Formatting

**Remaining Issues (3):**
- ⏸️ #34 - calendar_auth_status MCP Tool (in progress when stopped)
- ⏸️ #35 - OAuth Integration Tests
- ⏸️ #36 - OAuth Documentation

### Commits Made

4 commits for Parent #3:
- `aed4156` - Implement MCP OAuth authorization UI (#26)
- `e0a1641` - Add comprehensive tests for Google OAuth initiation (#27)
- `e8c5724` - Add comprehensive tests for Google OAuth status endpoint (#29)
- `87f4130` - Add MCP response format wrapper to error formatter (#33)

### Metrics (Partial)

- **Commits:** 4 (for issues #26, #27, #29, #33)
- **Issues closed:** 7 of 10 (70% complete)
- **Agent tokens used:** ~59k tokens (~29% of 200k limit)

### Why Stopped

**Context limit approaching:** Session reached 91% of 200k token limit (182k tokens used).

**Manual intervention:** Stopped agent proactively to avoid hitting hard limit and ensure clean handoff.

---

## Key Learnings & Process Improvements

### 1. Issue Closing Process

**Problem identified (Parent #1):**
- Agent claimed to close issues but didn't execute commands
- Issues left open despite work being complete

**Solution implemented:**
- Updated `process/execute-issues.md` with **mandatory issue closing language**
- Rule #3: "This is MANDATORY. Issues left open indicate incomplete work."
- Added explicit verification checklist
- Added orchestrator verification step

**Validation (Parent #2):**
- ✅ All 9 issues properly closed with timestamps
- ✅ Process works as designed

### 2. Context Monitoring

**Problem identified:**
- Agents cannot reliably self-monitor context usage
- Risk of hitting hard 200k limit with no graceful shutdown
- No opportunity to commit/update if forcefully terminated

**Proposed solution:**
- **Orchestrator-driven monitoring** instead of agent self-monitoring
- I receive progress notifications: "Agent X progress: N tokens used"
- When agent reaches ~140k-160k tokens (70-80%), orchestrator:
  1. Stops agent with TaskStop (before hard limit)
  2. Reads git log to determine checkpoint progress
  3. Updates GitHub issue with completed checkpoints
  4. Spawns fresh agent with updated "Current State"

**Advantage:**
- External visibility into token usage
- Clean handoff before crash
- Reliable checkpoint tracking

### 3. Checkpoint Update Responsibility

**Current approach (risky):**
- Agent responsible for updating GitHub when out of context
- May not have tokens left to execute updates

**Better approach (proposed):**
- **Orchestrator handles GitHub updates** when context depletes
- Agent only needs tokens to commit and report
- More reliable, cleaner separation of concerns

---

## Current Project State

### Files Created (Total)

**Source:** 11 files
- src/types.ts, src/env.d.ts, src/crypto.ts, src/session.ts, src/app.ts, src/index.ts
- src/calendar-api.ts, src/utils.ts, src/audit.ts, src/kv-storage.ts, src/error-formatter.ts

**Tests:** 13 files
- tests/crypto.test.ts, tests/session.test.ts, tests/calendar-api.test.ts
- tests/token-refresh.test.ts, tests/audit.test.ts, tests/oauth-callback.test.ts
- tests/kv-key-security.test.ts, tests/kv-storage.test.ts, tests/error-formatter.test.ts
- tests/security-integration.test.ts
- Plus 3 more from Parent #3 (partial)

**Documentation:** 2 files
- docs/security-kv-keys.md
- docs/oauth-setup-guide.md (partial)

**Scripts:** 2 files
- scripts/setup.sh, scripts/teardown.sh

**Config:** 3 files
- package.json, tsconfig.json, wrangler.jsonc

### Test Suite

- **Total:** 97+ tests passing
- **Coverage:** 96.51% line coverage, 87.74% branch coverage
- **Build:** Successful (101.34 KiB bundle)

### GitHub Issues

**Completed:**
- ✅ Parent #1 (10/10 issues) - Closed
- ✅ Parent #2 (9/9 issues) - Closed
- 🟡 Parent #3 (7/10 issues) - Open (3 remaining)

**Remaining:**
- Parent #3: Issues #34, #35, #36
- Parent #4: Google Calendar API Client (9 issues: #37-45)
- Parent #5: MCP Tools Implementation (9 issues: #46-54)
- Parent #6: Testing, Documentation & Setup (10 issues: #55-64)

**Total progress:** 26 of 63 issues closed (41%)

---

## Next Steps

### Immediate (Resume Parent #3)

**3 issues remaining:** #34 (calendar_auth_status), #35 (integration tests), #36 (documentation)

**Approach:**
1. Spawn fresh agent for Parent #3 with updated "Current State"
2. Agent focuses only on #34, #35, #36
3. Expected completion: ~20 minutes

### After Parent #3

**Execute remaining parents sequentially:**
- Parent #4: Google Calendar API Client (9 issues)
- Parent #5: MCP Tools Implementation (9 issues)
- Parent #6: Testing & Documentation (10 issues)

**With improved monitoring:**
- Orchestrator monitors token usage
- Proactive intervention at 70-80% context
- Clean handoffs with checkpoint updates

### Final QA

After all parents complete:
- Follow `process/first-run-qa.md`
- 5-layer QA: BUILD → BOOT → RENDER → FUNCTION → POLISH
- Integration testing with Claude Desktop
- Deployment to Cloudflare Workers

---

## Process Metrics

### Agent Performance

**Parent #1:**
- Duration: 19 minutes
- Context used: ~50% (121k tokens)
- Issues: 10
- Success: All closed (after manual fix)

**Parent #2:**
- Duration: 14 minutes
- Context used: ~54% (109k tokens)
- Issues: 9
- Success: All closed ✅

**Parent #3 (partial):**
- Duration: 12 minutes (stopped early)
- Context used: ~29% (59k tokens)
- Issues: 7 of 10 closed
- Success: Clean stop, ready to resume

**Average:**
- ~5-7 minutes per issue
- ~10-12k tokens per issue
- High success rate with updated process

---

## Critical Insights

1. **Agent hallucination is real:** Agents can claim to complete actions without executing them. Always verify.

2. **Context self-monitoring is unreliable:** Agents cannot accurately track their own context usage. Orchestrator monitoring is necessary.

3. **Issue closing must be mandatory:** Process language matters. "This is MANDATORY" worked where gentle suggestions didn't.

4. **Git commits are the source of truth:** Even if GitHub isn't updated, commits show what was done.

5. **Checkpoint updates need orchestrator:** When context depletes, agent may not have tokens for GitHub updates. Orchestrator should handle.

6. **Sequential execution validates process:** Parallel execution requires high confidence. Sequential execution found and fixed issues first.

---

## Repository State

**Branch:** main
**Last commit:** 87f4130 (feat: add MCP response format wrapper to error formatter #33)
**Total commits:** 34 (26 from execution agents, 8 from orchestrator/setup)
**Build status:** ✅ Success
**Tests:** ✅ 97+ passing
**Lint:** Not configured

**GitHub issues:**
- Open: 37 (including 3 from Parent #3)
- Closed: 26
- Total: 63

---

## Files Modified This Session

**Process updates:**
- `process/execute-issues.md` - Updated with mandatory issue closing requirements

**Source code:**
- 11 source files created/modified in src/
- 13 test files created in tests/
- 2 documentation files in docs/
- 2 setup scripts in scripts/
- 3 configuration files (package.json, tsconfig.json, wrangler.jsonc)

---

## Context for Next Session

**Resume from:** Parent #3, issues #34-36 (3 remaining)

**What to do:**
1. Read this file (SESSION_NOTES.md) for context
2. Check git log to see last commits
3. Verify issue status on GitHub
4. Spawn fresh agent for Parent #3 with only #34, #35, #36
5. Monitor agent token usage proactively
6. Continue to Parents #4, #5, #6 with orchestrator monitoring

**Critical files to preserve:**
- This SESSION_NOTES.md file
- process/execute-issues.md (updated process)
- All src/ and tests/ files (working code)
- .gitignore (properly configured)

**DO NOT touch:**
- docs/ (except when agent creates new docs per issues)
- process/ (except if updating process based on learnings)

---

## Session End: 2026-02-16

**Context used:** 182k / 200k tokens (91%)
**Duration:** ~2 hours
**Agents spawned:** 3 (Parent #1, #2, #3)
**Issues completed:** 26 of 63 (41%)
**Code quality:** High (96.51% test coverage, clean builds)
**Process learnings:** 3 major improvements identified and 1 implemented

**Status:** Good progress. Process validated. Ready to resume with improved monitoring.
