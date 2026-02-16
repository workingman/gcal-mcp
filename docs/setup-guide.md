# Calendar MCP Server - Complete Setup Guide

This guide walks you through deploying the Calendar MCP Server from scratch to a working Claude Desktop integration.

**Time required:** 30-45 minutes
**Difficulty:** Intermediate

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start (Automated)](#quick-start-automated)
3. [Manual Setup (Step-by-Step)](#manual-setup-step-by-step)
4. [Claude Desktop Configuration](#claude-desktop-configuration)
5. [Testing Your Setup](#testing-your-setup)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Tools

- **Node.js 18+** and npm
  Download: https://nodejs.org/

- **Cloudflare Account** (free tier works)
  Sign up: https://dash.cloudflare.com/sign-up

- **Google Cloud Account**
  Sign up: https://console.cloud.google.com/

- **Claude Desktop** with MCP support
  Download: https://claude.ai/download

### Optional Tools

- **wrangler CLI** (installed via npm if not global)
  ```bash
  npm install -g wrangler
  ```

- **gcloud CLI** (for automated GCP setup)
  Download: https://cloud.google.com/sdk/docs/install

---

## Quick Start (Automated)

The automated setup script handles most configuration for you.

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/calendar-mcp.git
cd calendar-mcp
```

### 2. Run Setup Script

```bash
bash scripts/setup.sh
```

The script will:
- Install dependencies
- Generate encryption keys
- Create Cloudflare KV namespaces
- Guide you through GCP OAuth setup
- Deploy the worker
- Validate configuration

### 3. Follow Interactive Prompts

The script will pause at key points for manual steps:
- **GCP OAuth**: Complete OAuth 2.0 client creation in browser
- **Worker URL**: Note your deployed worker URL for Claude config

### 4. Configure Claude Desktop

See [Claude Desktop Configuration](#claude-desktop-configuration) below.

---

## Manual Setup (Step-by-Step)

For those who prefer manual control or troubleshooting.

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Configure Cloudflare Authentication

```bash
npx wrangler login
```

This opens a browser for Cloudflare authentication.

### Step 3: Create KV Namespaces

```bash
npx wrangler kv namespace create OAUTH_KV
npx wrangler kv namespace create GOOGLE_TOKENS_KV
```

**Update `wrangler.jsonc`** with the namespace IDs from the output:

```jsonc
{
  "kv_namespaces": [
    { "binding": "OAUTH_KV", "id": "<your-oauth-kv-id>" },
    { "binding": "GOOGLE_TOKENS_KV", "id": "<your-tokens-kv-id>" }
  ]
}
```

### Step 4: Generate Encryption Keys

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # TOKEN_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # TOKEN_HMAC_KEY
```

Save these keys securely (you'll need them in Step 7).

### Step 5: Google Cloud Platform Setup

#### A. Create GCP Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project: **"Calendar MCP"**
3. Note your Project ID

#### B. Enable Google Calendar API

1. Go to [API Library](https://console.cloud.google.com/apis/library)
2. Search for "Google Calendar API"
3. Click **Enable**

#### C. Configure OAuth Consent Screen

1. Go to [OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent)
2. Select **External** user type (unless using Google Workspace)
3. Fill in required fields:
   - **App name:** Calendar MCP Server
   - **User support email:** Your email
   - **Developer contact:** Your email
4. Click **Save and Continue**
5. **Scopes:** Click **Add or Remove Scopes**
   - Search and add: `https://www.googleapis.com/auth/calendar`
6. **Test users:** Add your email address (required in Testing mode)
7. Click **Save and Continue** through remaining steps

#### D. Create OAuth 2.0 Client ID

1. Go to [Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
3. Application type: **Web application**
4. Name: **Calendar MCP**
5. **Authorized redirect URIs:** (you'll update this after deployment)
   - For now, use: `https://calendar-mcp.example.workers.dev/google/callback`
6. Click **CREATE**
7. **Copy Client ID and Client Secret** (save these securely)

### Step 6: Deploy Worker (First Time)

```bash
npm run deploy
```

**Note your Worker URL** from the output:
`https://calendar-mcp.<your-subdomain>.workers.dev`

### Step 7: Update OAuth Redirect URI

1. Go back to [GCP Credentials](https://console.cloud.google.com/apis/credentials)
2. Click your OAuth client
3. Update **Authorized redirect URIs** with your actual Worker URL:
   ```
   https://calendar-mcp.<your-subdomain>.workers.dev/google/callback
   ```
4. Click **Save**

### Step 8: Set Cloudflare Secrets

```bash
# Encryption keys (from Step 4)
echo "<your-encryption-key>" | npx wrangler secret put TOKEN_ENCRYPTION_KEY
echo "<your-hmac-key>" | npx wrangler secret put TOKEN_HMAC_KEY

# Google OAuth (from Step 5)
echo "<your-google-client-id>" | npx wrangler secret put GOOGLE_CLIENT_ID
echo "<your-google-client-secret>" | npx wrangler secret put GOOGLE_CLIENT_SECRET

# Worker URL (from Step 6)
echo "https://calendar-mcp.<your-subdomain>.workers.dev" | npx wrangler secret put WORKER_URL
```

### Step 9: Redeploy with Secrets

```bash
npm run deploy
```

---

## Claude Desktop Configuration

### 1. Locate Config File

- **macOS/Linux:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

### 2. Add MCP Server Configuration

Edit the file to add:

```json
{
  "mcpServers": {
    "calendar": {
      "url": "https://calendar-mcp.<your-subdomain>.workers.dev",
      "transport": {
        "type": "sse"
      }
    }
  }
}
```

**Replace** `<your-subdomain>` with your actual Cloudflare subdomain.

### 3. Restart Claude Desktop

Completely quit and restart Claude Desktop for changes to take effect.

---

## Testing Your Setup

### 1. Check MCP Connection

In Claude Desktop, type:

```
Check my calendar auth status
```

**Expected response:** Claude will provide a Google OAuth authorization URL.

### 2. Authorize with Google

1. Click the authorization URL
2. Sign in with your Google account
3. Review permissions (calendar access)
4. Click **Allow**
5. You'll be redirected back with a success message

### 3. Test Calendar Query

```
Show me my calendar events for tomorrow
```

**Expected response:** Claude lists your calendar events.

### 4. Verify Multi-Tool Functionality

Try each tool:

```
# List events
What's on my calendar for the next week?

# Search events
Search for all meetings with "standup" in the title

# Check availability
Am I free tomorrow afternoon?

# Create event (optional)
Create a meeting called "Team Sync" tomorrow at 2pm for 1 hour
```

---

## Troubleshooting

### "Google account not connected"

**Problem:** MCP OAuth completed but Google OAuth failed.

**Solution:**
1. Check worker logs: `npx wrangler tail`
2. Verify all secrets are set: `npx wrangler secret list`
3. Ensure OAuth redirect URI matches exactly (including `/google/callback`)

### "Invalid redirect_uri"

**Problem:** OAuth redirect URI mismatch.

**Solution:**
1. Verify redirect URI in [GCP Console](https://console.cloud.google.com/apis/credentials)
2. Must exactly match: `https://calendar-mcp.<subdomain>.workers.dev/google/callback`
3. No trailing slash, no http (must be https)

### "Request had invalid authentication credentials"

**Problem:** Secrets not properly set or worker not redeployed.

**Solution:**
```bash
# List secrets to verify
npx wrangler secret list

# Redeploy
npm run deploy
```

### "Worker not responding"

**Problem:** Worker deployment failed or crashed.

**Solution:**
1. Check deployment status: `npx wrangler deployments list`
2. View logs: `npx wrangler tail`
3. Verify KV namespaces: `npx wrangler kv namespace list`

### Claude Desktop Not Connecting

**Problem:** MCP configuration incorrect.

**Solution:**
1. Verify config file syntax (valid JSON)
2. Check worker URL is correct
3. Restart Claude Desktop completely (quit, not just close)
4. Check Claude Desktop logs (location varies by OS)

### GCP OAuth Consent Screen Issues

**Problem:** "App not verified" or "This app isn't verified by Google" warning.

**Solution:**
- **For personal use:** Add your email as a test user
- **For production:** Submit for Google verification (takes 1-2 weeks)
- During testing: Click "Advanced" → "Go to Calendar MCP (unsafe)" - this is safe for your own app

---

## Next Steps

After successful setup:

1. **Read the README:** Detailed tool documentation and examples
2. **Review docs/oauth-setup.md:** Advanced OAuth troubleshooting
3. **Check docs/security-kv-keys.md:** Security architecture details
4. **Run tests:** `npm test` to validate installation

---

## Additional Resources

- [Google Calendar API Documentation](https://developers.google.com/calendar/api)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [MCP Protocol Documentation](https://modelcontextprotocol.io/)

---

## Getting Help

If you encounter issues not covered here:

1. Check GitHub Issues: [Project Issues](https://github.com/yourusername/calendar-mcp/issues)
2. Review worker logs: `npx wrangler tail`
3. Verify all prerequisites are met
4. Try teardown and clean setup: `bash scripts/teardown.sh && bash scripts/setup.sh`
