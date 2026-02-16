// Hono routes for Google OAuth and MCP OAuth
// MCP OAuth implemented in issue #13, Google OAuth in issue #12

import { Hono } from 'hono';
import type { Env } from './env.d';

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

// Google OAuth routes will be added in issue #12

export default app;
