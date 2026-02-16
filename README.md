# Calendar MCP Server

Google Calendar integration for Claude via Model Context Protocol (MCP), running on Cloudflare Workers.

## Quick Start

### Automated Setup

Run the automated setup script:

```bash
bash scripts/setup.sh
```

This will:
1. Install dependencies
2. Create Cloudflare KV namespaces
3. Generate encryption keys
4. Set Cloudflare Secrets
5. Guide you through GCP OAuth setup

### Manual Setup

<details>
<summary>Click to expand manual setup instructions</summary>

#### 1. Install Dependencies

```bash
npm install
```

#### 2. Configure Cloudflare KV Namespaces

Create KV namespaces (if not already created):

```bash
npx wrangler kv namespace create OAUTH_KV
npx wrangler kv namespace create GOOGLE_TOKENS_KV
```

Update `wrangler.jsonc` with the namespace IDs from the output.

#### 3. Generate and Set Encryption Keys

Generate encryption keys:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # TOKEN_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # TOKEN_HMAC_KEY
```

Set as Cloudflare Secrets:

```bash
echo "<your-encryption-key>" | npx wrangler secret put TOKEN_ENCRYPTION_KEY
echo "<your-hmac-key>" | npx wrangler secret put TOKEN_HMAC_KEY
```

#### 4. Google Cloud Platform Setup

1. Go to [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials)
2. Create a new project or select existing
3. Enable Google Calendar API
4. Create OAuth 2.0 Client ID (Web application)
5. Set authorized redirect URI: `https://calendar-mcp.<your-subdomain>.workers.dev/google/callback`
6. Copy Client ID and Client Secret

Set Google OAuth credentials as secrets:

```bash
echo "<your-google-client-id>" | npx wrangler secret put GOOGLE_CLIENT_ID
echo "<your-google-client-secret>" | npx wrangler secret put GOOGLE_CLIENT_SECRET
echo "https://calendar-mcp.<your-subdomain>.workers.dev" | npx wrangler secret put WORKER_URL
```

#### 5. Deploy

```bash
npm run deploy
```

</details>

## Development

### Local Development

```bash
npm run dev
```

Starts local development server at `http://localhost:8787`

### Type Checking

```bash
npm run typecheck
```

### Testing

```bash
npm test
```

Runs all unit tests with coverage reporting.

### Build (Dry Run)

```bash
npm run build
```

Validates deployment without actually deploying.

## Project Structure

```
calendar-mcp/
├── src/
│   ├── index.ts           # Main Worker entry point
│   ├── app.ts             # Hono routes (Google OAuth, MCP OAuth)
│   ├── mcp-server.ts      # CalendarMCP Durable Object (7 MCP tools)
│   ├── crypto.ts          # Token encryption/decryption (AES-256-GCM)
│   ├── session.ts         # Session validation utilities
│   ├── calendar-api.ts    # Google Calendar API client
│   ├── utils.ts           # HTML rendering helpers
│   ├── types.ts           # TypeScript type definitions
│   └── env.d.ts           # Cloudflare Workers environment types
├── tests/
│   ├── crypto.test.ts     # TokenManager tests
│   ├── session.test.ts    # Session validation tests
│   └── calendar-api.test.ts # Google Calendar API client tests
├── scripts/
│   ├── setup.sh           # Automated setup script
│   └── teardown.sh        # Cleanup script
├── docs/
│   ├── prd-calendar-mcp.md  # Product requirements
│   ├── tdd-calendar-mcp.md  # Technical design document
│   └── arch-calendar-mcp.mmd # Architecture diagram
├── wrangler.jsonc         # Cloudflare Workers configuration
├── package.json           # Dependencies and scripts
└── tsconfig.json          # TypeScript configuration
```

## Implemented Features

### Infrastructure (Parent Issue #1) - Complete

- ✅ TypeScript project with Cloudflare Workers configuration
- ✅ KV namespaces for OAuth and token storage
- ✅ AES-256-GCM token encryption with Web Crypto API
- ✅ HMAC-based session validation
- ✅ Google Calendar API client
- ✅ Google OAuth authorization flow
- ✅ MCP OAuth routes
- ✅ CalendarMCP Durable Object skeleton (7 tools registered)
- ✅ Build and deployment pipeline

### MCP Tools

All 7 tools are registered with placeholder implementations:

1. `list_events` - Retrieve calendar events with filters
2. `get_event` - Get full details for a specific event
3. `search_events` - Search across calendars by keyword
4. `get_free_busy` - Check availability
5. `create_event` - Create new calendar event
6. `move_event` - Reschedule existing event
7. `calendar_auth_status` - Check Google account connection

## Security Features

- **AES-256-GCM Encryption**: All Google OAuth tokens encrypted at rest
- **HMAC-based KV Keys**: Non-enumerable, non-reversible storage keys
- **Triple Validation**: Session validation before KV fetch, after fetch, and after decryption
- **Proactive Token Refresh**: Automatic refresh at 5-minute expiry threshold
- **Audit Logging**: Security events logged for all token operations

## Cleanup

To remove all Cloudflare resources:

```bash
bash scripts/teardown.sh
```

This will delete KV namespaces and provide instructions for deleting secrets.
GCP OAuth client must be deleted manually from Google Cloud Console.

## Documentation

- [Product Requirements Document](docs/prd-calendar-mcp.md)
- [Technical Design Document](docs/tdd-calendar-mcp.md)
- [Architecture Diagram](docs/arch-calendar-mcp.mmd)

## License

MIT
