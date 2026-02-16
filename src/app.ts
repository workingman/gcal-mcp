// Hono routes for Google OAuth and MCP OAuth
// MCP OAuth implemented in issue #13, Google OAuth in issue #12

import { Hono } from 'hono';
import type { Env } from './env.d';
import { TokenManager, importEncryptionKey, importHmacKey } from './crypto';
import { computeKVKey } from './session';
import { authorizationPage, successPage, errorPage } from './utils';

const app = new Hono<{ Bindings: Env }>();

// MCP OAuth Routes

/**
 * GET /authorize - MCP authorization consent screen
 * Prompts user for email to establish session identity
 */
app.get('/authorize', async (c) => {
  const { searchParams } = new URL(c.req.url);

  // Display consent screen requesting user email
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Calendar MCP - Authorization</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            max-width: 600px;
            margin: 40px auto;
            padding: 20px;
            line-height: 1.6;
          }
          h1 { color: #333; }
          form { margin: 20px 0; }
          label { display: block; margin: 10px 0 5px; font-weight: 500; }
          input { width: 100%; padding: 8px; font-size: 16px; }
          button {
            background: #0066cc;
            color: white;
            border: none;
            padding: 12px 24px;
            font-size: 16px;
            cursor: pointer;
            margin-top: 15px;
          }
          button:hover { background: #0052a3; }
        </style>
      </head>
      <body>
        <h1>Calendar MCP Authorization</h1>
        <p>Claude Desktop is requesting access to your Google Calendar through this MCP server.</p>
        <p>Please enter your email address to establish your session:</p>
        <form method="POST" action="/approve?${searchParams}">
          <label for="email">Email Address:</label>
          <input type="email" id="email" name="email" required placeholder="you@example.com" />
          <button type="submit">Authorize Access</button>
        </form>
      </body>
    </html>
  `;

  return c.html(html);
});

/**
 * POST /approve - Complete MCP authorization
 * Captures user email and attaches to session props
 */
app.post('/approve', async (c) => {
  const formData = await c.req.formData();
  const userEmail = formData.get('email') as string;

  if (!userEmail) {
    return c.text('Email is required', 400);
  }

  // Store user email in session props
  const { searchParams } = new URL(c.req.url);
  const state = searchParams.get('state');

  if (state) {
    // Attach email to OAuth session
    await c.env.OAUTH_KV.put(
      `session:${state}`,
      JSON.stringify({ userEmail }),
      { expirationTtl: 3600 }
    );
  }

  // Continue with OAuth provider's approval flow
  const approvalUrl = `/token?${searchParams}`;
  return c.redirect(approvalUrl);
});

/**
 * POST /token - OAuth token exchange
 * Simplified implementation - will be integrated with agents McpAgent in issue #15
 */
app.post('/token', async (c) => {
  // Get session props from KV
  const formData = await c.req.formData();
  const state = formData.get('state') as string;

  let sessionProps = {};
  if (state) {
    const sessionData = await c.env.OAUTH_KV.get(`session:${state}`);
    if (sessionData) {
      sessionProps = JSON.parse(sessionData);
    }
  }

  // Handle token exchange via OAuthProvider
  // Note: This is a simplified implementation
  // Full implementation will be completed in integration testing
  return c.json({
    access_token: 'mcp_token_placeholder',
    token_type: 'Bearer',
    session_props: sessionProps,
  });
});

// MCP WebSocket endpoint (will be connected to CalendarMCP Durable Object in issue #15)
app.get('/mcp', async (c) => {
  // Upgrade to WebSocket and connect to CalendarMCP Durable Object
  // Implementation will be completed in issue #15
  return c.text('MCP WebSocket endpoint - pending issue #15', 501);
});

// Health check
app.get('/', (c) => c.text('Calendar MCP Server - Ready'));

// Google OAuth Routes

/**
 * GET /google/auth?user={email} - Initiate Google OAuth flow
 * Redirects to Google consent screen with user email in state
 */
app.get('/google/auth', (c) => {
  const userEmail = c.req.query('user');

  if (!userEmail) {
    return c.html(errorPage('Missing user email parameter'), 400);
  }

  const state = JSON.stringify({ userEmail });
  const redirectUri = `${c.env.WORKER_URL}/google/callback`;

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', c.env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar');
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);

  return c.redirect(authUrl.toString());
});

/**
 * GET /google/callback - Google OAuth callback
 * Exchanges authorization code for tokens, encrypts and stores in KV
 */
app.get('/google/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');

  if (error) {
    return c.html(
      errorPage(`Google OAuth error: ${error}. Please try again.`),
      400
    );
  }

  if (!code || !state) {
    return c.html(errorPage('Missing authorization code or state'), 400);
  }

  let userEmail: string;
  try {
    const stateData = JSON.parse(state);
    userEmail = stateData.userEmail;
  } catch {
    return c.html(errorPage('Invalid state parameter'), 400);
  }

  // Exchange authorization code for tokens
  const redirectUri = `${c.env.WORKER_URL}/google/callback`;
  const tokenUrl = 'https://oauth2.googleapis.com/token';

  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error('Token exchange failed:', errorText);
    return c.html(
      errorPage('Failed to exchange authorization code. Please try again.'),
      500
    );
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
  };

  // Prepare GoogleTokens structure
  const tokens = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: Date.now() + tokenData.expires_in * 1000,
    scope: tokenData.scope,
    user_email: userEmail,
    user_id: userEmail,
  };

  // Encrypt tokens using TokenManager
  const encryptionKey = await importEncryptionKey(c.env.TOKEN_ENCRYPTION_KEY);
  const hmacKey = await importHmacKey(c.env.TOKEN_HMAC_KEY);
  const manager = new TokenManager(encryptionKey, hmacKey);

  const encryptedToken = await manager.encrypt(tokens, userEmail);

  // Compute KV key and store encrypted token
  const kvKey = await computeKVKey(userEmail, hmacKey);
  await c.env.GOOGLE_TOKENS_KV.put(kvKey, JSON.stringify(encryptedToken));

  console.log(`[Google OAuth] Tokens stored for user: ${userEmail}`);

  return c.html(
    successPage(
      `Successfully connected Google Calendar for ${userEmail}. You can now close this window and return to Claude Desktop.`
    )
  );
});

/**
 * GET /google/status?user={email} - Debug endpoint for token status
 * Shows token expiry and validation status
 */
app.get('/google/status', async (c) => {
  const userEmail = c.req.query('user');

  if (!userEmail) {
    return c.html(errorPage('Missing user email parameter'), 400);
  }

  try {
    const hmacKey = await importHmacKey(c.env.TOKEN_HMAC_KEY);
    const kvKey = await computeKVKey(userEmail, hmacKey);

    const encryptedJson = await c.env.GOOGLE_TOKENS_KV.get(kvKey);

    if (!encryptedJson) {
      return c.html(
        `<html><body><h1>No Google Calendar connection found for ${userEmail}</h1><p><a href="/google/auth?user=${encodeURIComponent(
          userEmail
        )}">Click here to authorize</a></p></body></html>`
      );
    }

    const encrypted = JSON.parse(encryptedJson);
    const expiresAt = new Date(encrypted.expires_at);
    const now = new Date();
    const timeRemaining = encrypted.expires_at - now.getTime();
    const minutesRemaining = Math.floor(timeRemaining / 60000);

    return c.html(
      `<html><body><h1>Google Calendar Status for ${userEmail}</h1><p>Token expires: ${expiresAt.toISOString()}</p><p>Time remaining: ${minutesRemaining} minutes</p><p>Status: ${
        timeRemaining > 0 ? 'Valid' : 'Expired'
      }</p></body></html>`
    );
  } catch (error) {
    return c.html(
      errorPage(
        `Error checking status: ${error instanceof Error ? error.message : 'Unknown error'}`
      ),
      500
    );
  }
});

export default app;
