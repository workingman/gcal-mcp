// HTML rendering helpers for OAuth screens
// Will be implemented in issue #12

export function authorizationPage(authUrl: string): string {
  // Stub implementation
  return `<html><body>Authorization page - authUrl: ${authUrl}</body></html>`;
}

export function successPage(message: string): string {
  // Stub implementation
  return `<html><body>Success: ${message}</body></html>`;
}

export function errorPage(error: string): string {
  // Stub implementation
  return `<html><body>Error: ${error}</body></html>`;
}
