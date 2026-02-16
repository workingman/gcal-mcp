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
