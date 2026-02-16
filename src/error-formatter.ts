// Security error formatting utilities
// Generates user-friendly error messages with personalized auth URLs
// Never exposes sensitive information (tokens, keys, internal state)

/**
 * Format error when user has no token stored
 * Provides personalized auth URL to initiate OAuth flow
 */
export function formatNoTokenError(userEmail: string, workerUrl: string): string {
  const authUrl = `${workerUrl}/google/auth?user=${encodeURIComponent(userEmail)}`;
  return `Google account not connected for ${userEmail}. Please visit ${authUrl} to authorize access to your Google Calendar, then try again.`;
}

/**
 * Format error when token has expired and cannot be refreshed
 * Provides personalized auth URL for re-authorization
 */
export function formatTokenExpiredError(
  userEmail: string,
  workerUrl: string
): string {
  const authUrl = `${workerUrl}/google/auth?user=${encodeURIComponent(userEmail)}`;
  return `Token refresh failed. Your Google authorization has expired for ${userEmail}. Please visit ${authUrl} to re-authorize, then try again.`;
}

/**
 * Format error for session validation failures
 * Generic message without exposing user IDs or internal state
 */
export function formatSessionValidationError(): string {
  return 'Session validation failed. Please re-authorize your Google account.';
}

/**
 * Format error for Google API permission denied (403)
 * Clear explanation without exposing tokens or internal details
 */
export function formatGoogleApiPermissionError(operation: string): string {
  return `Permission denied: cannot access ${operation}. Please ensure you have granted calendar access permissions.`;
}

/**
 * Format error for Google API quota exceeded (429)
 * User-friendly message explaining rate limiting
 */
export function formatGoogleApiQuotaError(): string {
  return 'Google Calendar API quota exceeded. Please try again in a few minutes.';
}

/**
 * Format error for Google API authentication failure (401)
 * Indicates token is invalid without exposing token value
 */
export function formatGoogleApiAuthError(userEmail: string, workerUrl: string): string {
  const authUrl = `${workerUrl}/google/auth?user=${encodeURIComponent(userEmail)}`;
  return `Authentication with Google failed for ${userEmail}. Your access may have been revoked. Please visit ${authUrl} to re-authorize.`;
}

/**
 * Generic error formatter for unexpected errors
 * Sanitizes error messages to avoid leaking sensitive data
 */
export function formatGenericError(error: Error, userEmail: string): string {
  // Sanitize error message - remove any tokens or sensitive data
  const sanitized = error.message
    .replace(/ya29\.[^\s]+/g, '[REDACTED_TOKEN]')
    .replace(/[0-9a-f]{64}/gi, '[REDACTED_HASH]')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]');

  return `An error occurred for ${userEmail}: ${sanitized}`;
}

/**
 * Check if error message contains sensitive data
 * Returns true if message appears safe to display
 */
export function isSafeErrorMessage(message: string): boolean {
  const sensitivePatterns = [
    /ya29\./i, // Google access token prefix
    /[0-9a-f]{64}/i, // 64-char hex (likely HMAC hash or token)
    /Bearer\s+/i, // Authorization header
    /client_secret/i, // OAuth client secret
    /refresh_token/i, // Refresh token field
  ];

  for (const pattern of sensitivePatterns) {
    if (pattern.test(message)) {
      return false; // Message contains sensitive data
    }
  }

  return true; // Message appears safe
}
