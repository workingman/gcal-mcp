// HTML rendering helpers for OAuth screens

const baseStyles = `
  body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    max-width: 600px;
    margin: 60px auto;
    padding: 30px;
    line-height: 1.6;
    background: #f5f5f5;
  }
  .card {
    background: white;
    padding: 30px;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }
  h1 {
    color: #333;
    margin-top: 0;
  }
  .success { color: #0a7d0a; }
  .error { color: #d13212; }
  a {
    color: #0066cc;
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }
  button {
    background: #0066cc;
    color: white;
    border: none;
    padding: 12px 24px;
    font-size: 16px;
    border-radius: 4px;
    cursor: pointer;
    margin-top: 15px;
  }
  button:hover {
    background: #0052a3;
  }
`;

/**
 * Generate HTML page for OAuth authorization redirect
 */
export function authorizationPage(authUrl: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Authorize Google Calendar</title>
        <style>${baseStyles}</style>
      </head>
      <body>
        <div class="card">
          <h1>Google Calendar Authorization</h1>
          <p>Click the button below to authorize access to your Google Calendar:</p>
          <a href="${authUrl}">
            <button>Connect Google Calendar</button>
          </a>
        </div>
      </body>
    </html>
  `;
}

/**
 * Generate HTML success page
 */
export function successPage(message: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Success</title>
        <style>${baseStyles}</style>
      </head>
      <body>
        <div class="card">
          <h1 class="success">✓ Success</h1>
          <p>${message}</p>
        </div>
      </body>
    </html>
  `;
}

/**
 * Generate HTML error page
 */
export function errorPage(error: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Error</title>
        <style>${baseStyles}</style>
      </head>
      <body>
        <div class="card">
          <h1 class="error">Error</h1>
          <p>${error}</p>
          <p><a href="/">← Return to home</a></p>
        </div>
      </body>
    </html>
  `;
}

/**
 * Generate HTML page for MCP OAuth authorization form
 * Prompts user for email to establish session identity
 */
export function mcpAuthorizationPage(searchParams: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Calendar MCP - Authorization</title>
        <style>
          ${baseStyles}
          form { margin: 20px 0; }
          label {
            display: block;
            margin: 10px 0 5px;
            font-weight: 500;
            color: #333;
          }
          input {
            width: 100%;
            padding: 10px;
            font-size: 16px;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-sizing: border-box;
          }
          input:focus {
            outline: none;
            border-color: #0066cc;
          }
          .info {
            background: #f0f7ff;
            border-left: 4px solid #0066cc;
            padding: 15px;
            margin: 15px 0;
          }
          .permissions {
            margin: 15px 0;
          }
          .permissions ul {
            margin: 10px 0;
            padding-left: 20px;
          }
          .permissions li {
            margin: 5px 0;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Calendar MCP Authorization</h1>
          <p>Claude Desktop is requesting access to your Google Calendar through this MCP server.</p>

          <div class="info">
            <strong>What is this?</strong>
            <p>This authorization establishes your identity with the Calendar MCP server. You'll need to separately authorize Google Calendar access in a later step.</p>
          </div>

          <div class="permissions">
            <strong>This server will be able to:</strong>
            <ul>
              <li>Associate your email with MCP sessions</li>
              <li>Retrieve your encrypted Google Calendar tokens</li>
              <li>Access Google Calendar on your behalf</li>
            </ul>
          </div>

          <form method="POST" action="/approve?${searchParams}">
            <label for="email">Email Address:</label>
            <input
              type="email"
              id="email"
              name="email"
              required
              placeholder="you@example.com"
              autocomplete="email"
            />
            <button type="submit">Authorize Access</button>
          </form>
        </div>
      </body>
    </html>
  `;
}
