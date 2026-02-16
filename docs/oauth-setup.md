# OAuth Setup Guide

Complete guide for setting up Google OAuth authentication for Calendar MCP Server.

## Prerequisites

Before starting, ensure you have:

- **Google Cloud Platform (GCP) account** - [Create one](https://console.cloud.google.com)
- **Cloudflare account** - [Sign up](https://dash.cloudflare.com/sign-up)
- **Wrangler CLI** - Install and authenticate:
  ```bash
  npm install -g wrangler
  wrangler login
  ```
- **Claude Desktop** - [Download](https://claude.ai/download)
- **Node.js** - Version 18 or higher

## Step 1: Create Google OAuth Credentials

### 1.1 Create or Select GCP Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click the project dropdown at the top
3. Click "New Project" or select an existing project
4. Name your project (e.g., "Calendar MCP")

### 1.2 Enable Google Calendar API

1. Go to [APIs & Services > Library](https://console.cloud.google.com/apis/library)
2. Search for "Google Calendar API"
3. Click "Google Calendar API"
4. Click "Enable"

### 1.3 Configure OAuth Consent Screen

1. Go to [APIs & Services > OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)
2. Select **External** user type (unless you have a Google Workspace)
3. Click "Create"
4. Fill in the required fields:
   - **App name**: `Calendar MCP` (or your preferred name)
   - **User support email**: Your email address
   - **Developer contact information**: Your email address
5. Click "Save and Continue"
6. On the "Scopes" page:
   - Click "Add or Remove Scopes"
   - Search for "Google Calendar API"
   - Select: `https://www.googleapis.com/auth/calendar`
   - Click "Update"
   - Click "Save and Continue"
7. On the "Test users" page (if app is in development mode):
   - Click "Add Users"
   - Add your Google account email
   - Click "Save and Continue"
8. Click "Back to Dashboard"

### 1.4 Create OAuth 2.0 Client ID

1. Go to [APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials)
2. Click "Create Credentials" > "OAuth client ID"
3. Select **Web application** as application type
4. Configure:
   - **Name**: `Calendar MCP Worker`
   - **Authorized redirect URIs**: Click "Add URI"
     - Enter: `https://calendar-mcp.<your-subdomain>.workers.dev/google/callback`
     - Replace `<your-subdomain>` with your Cloudflare Workers subdomain
     - You can also use a custom domain if you have one configured
5. Click "Create"
6. **Important**: Copy the Client ID and Client Secret from the popup
   - Store these securely - you'll need them in Step 3

### 1.5 Verify Configuration

Your OAuth consent screen should show:
- Scopes: `https://www.googleapis.com/auth/calendar`
- Redirect URIs: `https://calendar-mcp.<your-subdomain>.workers.dev/google/callback`

## Step 2: Generate Encryption Keys

The Calendar MCP Server uses two encryption keys:
1. **TOKEN_ENCRYPTION_KEY** - For AES-256-GCM encryption of Google tokens
2. **TOKEN_HMAC_KEY** - For HMAC-SHA256 signing of KV storage keys

Generate both keys using Node.js:

```bash
# Generate TOKEN_ENCRYPTION_KEY (64-character hex string)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate TOKEN_HMAC_KEY (64-character hex string)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Important**: Save both keys securely. You'll need them in Step 3.

**Example output:**
```
a3271085b886512025e9fcd71336ac4393ddb400848b8197b53ae0dadc6eb9b4
9b0ea7b56b8ca68821c96e032c55dab2cc58206d63226cf3519b92f4784f38f9
```

## Step 3: Configure Cloudflare Secrets

Set all required secrets using the Wrangler CLI:

```bash
# Set encryption keys (generated in Step 2)
echo "<your-64-char-encryption-key>" | wrangler secret put TOKEN_ENCRYPTION_KEY
echo "<your-64-char-hmac-key>" | wrangler secret put TOKEN_HMAC_KEY

# Set Google OAuth credentials (from Step 1.4)
echo "<your-google-client-id>" | wrangler secret put GOOGLE_CLIENT_ID
echo "<your-google-client-secret>" | wrangler secret put GOOGLE_CLIENT_SECRET

# Set Worker URL (your Cloudflare Workers domain)
echo "https://calendar-mcp.<your-subdomain>.workers.dev" | wrangler secret put WORKER_URL
```

**Note**: Replace placeholders with your actual values:
- `<your-64-char-encryption-key>` - From Step 2 (first key)
- `<your-64-char-hmac-key>` - From Step 2 (second key)
- `<your-google-client-id>` - From Step 1.4
- `<your-google-client-secret>` - From Step 1.4
- `<your-subdomain>` - Your Cloudflare Workers subdomain (find it at [Workers & Pages](https://dash.cloudflare.com))

### Verify Secrets

List all secrets to verify they're set:

```bash
wrangler secret list
```

Expected output:
```
TOKEN_ENCRYPTION_KEY
TOKEN_HMAC_KEY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
WORKER_URL
```

## Step 4: Create KV Namespaces

The Calendar MCP Server uses two KV namespaces:
1. **OAUTH_KV** - Stores MCP OAuth sessions
2. **GOOGLE_TOKENS_KV** - Stores encrypted Google tokens

Create both namespaces:

```bash
# Create production namespaces
wrangler kv namespace create OAUTH_KV
wrangler kv namespace create GOOGLE_TOKENS_KV
```

**Important**: Copy the namespace IDs from the output.

### Update wrangler.jsonc

Open `wrangler.jsonc` and update the `kv_namespaces` section with your IDs:

```jsonc
{
  "kv_namespaces": [
    {
      "binding": "OAUTH_KV",
      "id": "<your-oauth-kv-id>"  // Replace with ID from create command
    },
    {
      "binding": "GOOGLE_TOKENS_KV",
      "id": "<your-google-tokens-kv-id>"  // Replace with ID from create command
    }
  ]
}
```

## Step 5: Deploy Worker

Deploy the Calendar MCP Server to Cloudflare Workers:

```bash
npm run deploy
```

Expected output:
```
Published calendar-mcp (X.XX sec)
  https://calendar-mcp.<your-subdomain>.workers.dev
```

### Verify Deployment

Test the worker health endpoint:

```bash
curl https://calendar-mcp.<your-subdomain>.workers.dev/
```

Expected response:
```
Calendar MCP Server - Ready
```

## Step 6: Configure Claude Desktop

Add the Calendar MCP Server to Claude Desktop's configuration.

### 6.1 Locate Configuration File

The configuration file location varies by operating system:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

### 6.2 Update Configuration

Open `claude_desktop_config.json` in a text editor and add:

```json
{
  "mcpServers": {
    "calendar-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-client",
        "https://calendar-mcp.<your-subdomain>.workers.dev/mcp"
      ]
    }
  }
}
```

**Replace** `<your-subdomain>` with your Cloudflare Workers subdomain.

If you already have other MCP servers configured, add the `calendar-mcp` entry to the existing `mcpServers` object:

```json
{
  "mcpServers": {
    "existing-server": {
      "command": "...",
      "args": ["..."]
    },
    "calendar-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-client",
        "https://calendar-mcp.<your-subdomain>.workers.dev/mcp"
      ]
    }
  }
}
```

### 6.3 Restart Claude Desktop

Quit and relaunch Claude Desktop to load the new MCP server.

## Step 7: Test OAuth Flow

### 7.1 MCP Authorization (First-Time Setup)

1. Open Claude Desktop
2. Start a new conversation
3. Type a calendar-related request (e.g., "What's on my calendar today?")
4. Claude will prompt you to authorize the MCP server
5. You'll receive a personalized authorization URL
6. Visit the URL in your browser
7. Enter your email address in the MCP authorization form
8. Click "Authorize Access"

### 7.2 Google OAuth Authorization

After MCP authorization, Claude will provide a Google OAuth URL:

1. Visit the Google OAuth URL in your browser
2. Sign in with your Google account
3. Review the permissions request
4. Click "Allow" to grant calendar access
5. You'll be redirected to a success page
6. Return to Claude Desktop

### 7.3 Test Calendar Tools

Try these commands in Claude:

```
What's on my calendar today?
```

```
Create a calendar event for tomorrow at 2pm titled "Team meeting"
```

```
What's my availability next week?
```

### 7.4 Check OAuth Status

You can check your Google OAuth connection status:

```bash
curl "https://calendar-mcp.<your-subdomain>.workers.dev/google/status?user=<your-email>"
```

Replace `<your-email>` with the email you used during authorization.

## Troubleshooting

### Error: "redirect_uri_mismatch"

**Cause**: The redirect URI in your Google OAuth request doesn't match the one configured in GCP.

**Solution**:
1. Go to [GCP Credentials](https://console.cloud.google.com/apis/credentials)
2. Click your OAuth 2.0 Client ID
3. Verify "Authorized redirect URIs" includes: `https://calendar-mcp.<your-subdomain>.workers.dev/google/callback`
4. Ensure the URL exactly matches (no trailing slashes, correct subdomain)
5. Save changes and wait 5 minutes for propagation
6. Restart the OAuth flow

### Error: "invalid_grant"

**Cause**: The authorization code has expired or was already used.

**Solution**:
1. Authorization codes expire after 10 minutes
2. Each code can only be used once
3. Restart the OAuth flow from Step 7.2
4. Complete the flow within 10 minutes

### Error: "Token expired"

**Cause**: Your Google access token has expired (tokens expire after 1 hour).

**Solution**:
1. The server should automatically refresh tokens when they're about to expire
2. If auto-refresh fails, manually re-authorize:
   ```bash
   curl "https://calendar-mcp.<your-subdomain>.workers.dev/google/auth?user=<your-email>"
   ```
3. Complete the Google OAuth flow again

### Error: "Session validation failed"

**Cause**: Security violation - attempting to access another user's tokens.

**Solution**:
1. This is a security error indicating a potential attack
2. Verify you're using the correct email address
3. Check the audit logs:
   ```bash
   wrangler tail
   ```
4. If you see repeated validation failures, investigate for unauthorized access attempts

### Error: "No token found for user"

**Cause**: You haven't completed Google OAuth authorization yet.

**Solution**:
1. Visit the Google OAuth authorization URL:
   ```bash
   curl "https://calendar-mcp.<your-subdomain>.workers.dev/google/auth?user=<your-email>"
   ```
2. Copy the redirect URL from the response
3. Visit the URL in your browser
4. Complete the Google OAuth flow

### Error: "Failed to exchange authorization code"

**Cause**: Invalid Google OAuth credentials or network error.

**Solution**:
1. Verify your GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are correct:
   ```bash
   wrangler secret list
   ```
2. Re-set secrets if needed (see Step 3)
3. Check GCP Console for API errors
4. Ensure Google Calendar API is enabled (see Step 1.2)

### Calendar Tools Not Showing in Claude

**Cause**: MCP server not loaded or configured incorrectly.

**Solution**:
1. Verify `claude_desktop_config.json` is correct (see Step 6)
2. Restart Claude Desktop completely (quit and relaunch)
3. Check MCP server logs:
   ```bash
   wrangler tail --format pretty
   ```
4. Test worker health endpoint:
   ```bash
   curl https://calendar-mcp.<your-subdomain>.workers.dev/
   ```

### KV Namespace Errors

**Cause**: KV namespaces not created or bound incorrectly.

**Solution**:
1. Verify namespaces exist:
   ```bash
   wrangler kv namespace list
   ```
2. Check `wrangler.jsonc` bindings match namespace IDs
3. Re-create namespaces if needed (see Step 4)
4. Redeploy worker:
   ```bash
   npm run deploy
   ```

## Security Best Practices

### Protect Your Secrets

1. **Never commit secrets to version control**
   - Add `.env*` to `.gitignore`
   - Use Cloudflare Secrets (not environment variables)

2. **Rotate encryption keys periodically**
   - Generate new keys every 90 days
   - Update via `wrangler secret put`
   - Note: Rotating keys will invalidate existing tokens (users must re-authorize)

3. **Monitor audit logs**
   - Watch for "Session validation failed" errors
   - Investigate repeated failures from the same user
   - Use Cloudflare Workers analytics to track usage patterns

### Limit OAuth Scopes

The Calendar MCP Server only requests:
- `https://www.googleapis.com/auth/calendar` (read + write calendar access)

**Never** add additional scopes unless absolutely necessary.

### Use Test Users During Development

1. Keep your GCP OAuth app in "Testing" mode during development
2. Add specific test users in the OAuth consent screen
3. Only publish to production when ready for general use

## Advanced Configuration

### Custom Domain

To use a custom domain instead of `*.workers.dev`:

1. Add a custom route in Cloudflare Workers:
   ```bash
   wrangler route add https://calendar.yourdomain.com/* calendar-mcp
   ```
2. Update WORKER_URL secret:
   ```bash
   echo "https://calendar.yourdomain.com" | wrangler secret put WORKER_URL
   ```
3. Update GCP OAuth redirect URI to:
   ```
   https://calendar.yourdomain.com/google/callback
   ```

### Multiple Environments

To maintain separate dev/staging/production environments:

1. Create separate KV namespaces for each environment
2. Use `wrangler.jsonc` with environment-specific bindings
3. Deploy with environment flags:
   ```bash
   wrangler deploy --env production
   ```

### Monitoring and Logging

View real-time logs:

```bash
wrangler tail --format pretty
```

Filter for security events:

```bash
wrangler tail --format pretty | grep SECURITY
```

## Next Steps

After completing OAuth setup:

1. Review the [Technical Design Document](./tdd-calendar-mcp.md) for architecture details
2. Read the [Product Requirements Document](./prd-calendar-mcp.md) for feature specifications
3. Check the [README](../README.md) for development workflow

## Support

If you encounter issues not covered in this guide:

1. Check [GitHub Issues](https://github.com/workingman/gcal-mcp/issues)
2. Review [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/)
3. Consult [Google OAuth 2.0 documentation](https://developers.google.com/identity/protocols/oauth2)
