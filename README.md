# Calendar MCP Server

Google Calendar integration for Claude via Model Context Protocol (MCP), running on Cloudflare Workers.

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Cloudflare KV Namespaces

KV namespaces have been created:
- `OAUTH_KV` (id: `3c26e5084d954590962b23e904dd2000`)
- `GOOGLE_TOKENS_KV` (id: `78fde26001e547f3823bf30de15ed49b`)

These are already configured in `wrangler.jsonc`.

### 3. Set Cloudflare Secrets

The following secrets need to be set using `wrangler secret put`:

**Encryption keys** (already generated in `.tmp/encryption-keys.txt`):
```bash
echo "a3271085b886512025e9fcd71336ac4393ddb400848b8197b53ae0dadc6eb9b4" | npx wrangler secret put TOKEN_ENCRYPTION_KEY
echo "9b0ea7b56b8ca68821c96e032c55dab2cc58206d63226cf3519b92f4784f38f9" | npx wrangler secret put TOKEN_HMAC_KEY
```

**Google OAuth credentials** (after setting up GCP OAuth client):
```bash
echo "<your-google-client-id>" | npx wrangler secret put GOOGLE_CLIENT_ID
echo "<your-google-client-secret>" | npx wrangler secret put GOOGLE_CLIENT_SECRET
echo "https://calendar-mcp.<your-subdomain>.workers.dev" | npx wrangler secret put WORKER_URL
```

### 4. Google Cloud Platform Setup

1. Create a new GCP project or use an existing one
2. Enable Google Calendar API
3. Create OAuth 2.0 credentials (Web application)
4. Set authorized redirect URI: `https://calendar-mcp.<your-subdomain>.workers.dev/google/callback`
5. Copy the client ID and secret to set as Cloudflare Secrets (step 3 above)

### 5. Deploy

```bash
npm run deploy
```

## Development

Run locally:
```bash
npm run dev
```

Type check:
```bash
npm run typecheck
```

Run tests:
```bash
npm test
```

## Project Status

Currently implementing infrastructure and backend components (Parent Issue #1).

See `docs/` for detailed documentation:
- `docs/prd-calendar-mcp.md` - Product requirements
- `docs/tdd-calendar-mcp.md` - Technical design document
- `docs/arch-calendar-mcp.mmd` - Architecture diagram
