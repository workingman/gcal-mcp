// Unit tests for error formatting utilities (error-formatter.ts)
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  formatNoTokenError,
  formatTokenExpiredError,
  formatSessionValidationError,
  formatGoogleApiPermissionError,
  formatGoogleApiQuotaError,
  formatGoogleApiAuthError,
  formatGenericError,
  isSafeErrorMessage,
} from '../src/error-formatter.ts';

describe('Error Formatting Utilities', () => {
  it('should format no token error with personalized auth URL', () => {
    const error = formatNoTokenError('test@example.com', 'https://worker.example.com');

    assert.ok(
      error.includes('test@example.com'),
      'Error should include user email'
    );
    assert.ok(
      error.includes('https://worker.example.com/google/auth?user=test%40example.com'),
      'Error should include personalized auth URL'
    );
    assert.ok(
      error.includes('not connected'),
      'Error should explain no connection'
    );
  });

  it('should format token expired error with re-auth URL', () => {
    const error = formatTokenExpiredError(
      'test@example.com',
      'https://worker.example.com'
    );

    assert.ok(
      error.includes('test@example.com'),
      'Error should include user email'
    );
    assert.ok(
      error.includes('https://worker.example.com/google/auth?user=test%40example.com'),
      'Error should include re-auth URL'
    );
    assert.ok(
      error.includes('expired'),
      'Error should mention expiration'
    );
    assert.ok(
      error.includes('re-authorize'),
      'Error should suggest re-authorization'
    );
  });

  it('should format session validation error without exposing internals', () => {
    const error = formatSessionValidationError();

    assert.ok(
      error.includes('Session validation failed'),
      'Error should mention validation failure'
    );
    assert.ok(
      !error.includes('user_id'),
      'Error should not expose user_id'
    );
    assert.ok(
      !error.includes('hash'),
      'Error should not expose hash values'
    );
    assert.ok(
      !error.includes('HMAC'),
      'Error should not expose HMAC details'
    );
  });

  it('should format Google API permission error clearly', () => {
    const error = formatGoogleApiPermissionError('calendar');

    assert.ok(
      error.includes('Permission denied'),
      'Error should mention permission denial'
    );
    assert.ok(
      error.includes('calendar'),
      'Error should mention the operation'
    );
    assert.ok(
      error.includes('granted'),
      'Error should mention permissions'
    );
  });

  it('should format Google API quota error', () => {
    const error = formatGoogleApiQuotaError();

    assert.ok(
      error.includes('quota exceeded'),
      'Error should mention quota'
    );
    assert.ok(
      error.includes('try again'),
      'Error should suggest retry'
    );
  });

  it('should format Google API auth error with re-auth URL', () => {
    const error = formatGoogleApiAuthError(
      'test@example.com',
      'https://worker.example.com'
    );

    assert.ok(
      error.includes('Authentication with Google failed'),
      'Error should mention auth failure'
    );
    assert.ok(
      error.includes('test@example.com'),
      'Error should include user email'
    );
    assert.ok(
      error.includes('https://worker.example.com/google/auth'),
      'Error should include re-auth URL'
    );
  });

  it('should sanitize generic errors to remove tokens', () => {
    const unsafeError = new Error(
      'Failed to refresh token ya29.a0AfB_byC1234567890 for user'
    );

    const sanitized = formatGenericError(unsafeError, 'test@example.com');

    assert.ok(
      !sanitized.includes('ya29.'),
      'Sanitized error should not contain token prefix'
    );
    assert.ok(
      sanitized.includes('[REDACTED_TOKEN]'),
      'Sanitized error should replace token with placeholder'
    );
    assert.ok(
      sanitized.includes('test@example.com'),
      'Sanitized error should include user email'
    );
  });

  it('should sanitize generic errors to remove HMAC hashes', () => {
    const unsafeError = new Error(
      'Hash mismatch: expected 7f3ab2c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2'
    );

    const sanitized = formatGenericError(unsafeError, 'test@example.com');

    assert.ok(
      !sanitized.includes('7f3ab2c4d5e6f7a8'),
      'Sanitized error should not contain hash'
    );
    assert.ok(
      sanitized.includes('[REDACTED_HASH]'),
      'Sanitized error should replace hash with placeholder'
    );
  });

  it('should sanitize generic errors to remove Bearer tokens', () => {
    const unsafeError = new Error('Request failed with Authorization: Bearer ya29.abc123');

    const sanitized = formatGenericError(unsafeError, 'test@example.com');

    assert.ok(
      !sanitized.includes('Bearer ya29'),
      'Sanitized error should not contain Bearer token'
    );
    assert.ok(
      sanitized.includes('Bearer [REDACTED]'),
      'Sanitized error should replace Bearer token with placeholder'
    );
  });

  it('should detect unsafe error messages with tokens', () => {
    const unsafeMessages = [
      'Token: ya29.a0AfB_byC1234567890',
      'Authorization: Bearer ya29.token',
      'Invalid refresh_token provided',
    ];

    for (const message of unsafeMessages) {
      assert.strictEqual(
        isSafeErrorMessage(message),
        false,
        `Message should be detected as unsafe: ${message}`
      );
    }
  });

  it('should detect unsafe error messages with hashes', () => {
    const unsafeMessage =
      'Hash: 7f3ab2c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2';

    assert.strictEqual(
      isSafeErrorMessage(unsafeMessage),
      false,
      'Message with 64-char hex should be unsafe'
    );
  });

  it('should detect safe error messages', () => {
    const safeMessages = [
      'Token not found for user test@example.com',
      'Session validation failed',
      'Permission denied: cannot access calendar',
      'Google Calendar API quota exceeded',
    ];

    for (const message of safeMessages) {
      assert.strictEqual(
        isSafeErrorMessage(message),
        true,
        `Message should be detected as safe: ${message}`
      );
    }
  });

  it('should URL-encode user emails in auth URLs', () => {
    const error = formatNoTokenError(
      'user+test@example.com',
      'https://worker.example.com'
    );

    // + should be encoded as %2B
    assert.ok(
      error.includes('user%2Btest%40example.com'),
      'Email should be URL-encoded'
    );
  });

  it('should not expose client_secret in errors', () => {
    const unsafeError = new Error(
      'OAuth failed: client_secret=abc123 is invalid'
    );

    const sanitized = formatGenericError(unsafeError, 'test@example.com');

    // Generic formatter doesn't explicitly sanitize client_secret,
    // but isSafeErrorMessage should detect it
    assert.strictEqual(
      isSafeErrorMessage(unsafeError.message),
      false,
      'Error with client_secret should be flagged as unsafe'
    );
  });

  it('should handle errors with multiple sensitive patterns', () => {
    const unsafeError = new Error(
      'Token ya29.abc123 with hash 7f3ab2c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2 and Bearer auth'
    );

    const sanitized = formatGenericError(unsafeError, 'test@example.com');

    assert.ok(
      !sanitized.includes('ya29.'),
      'Should remove token prefix'
    );
    assert.ok(
      !sanitized.includes('7f3ab2c4'),
      'Should remove hash'
    );
    assert.ok(
      sanitized.includes('[REDACTED_TOKEN]'),
      'Should have token placeholder'
    );
    assert.ok(
      sanitized.includes('[REDACTED_HASH]'),
      'Should have hash placeholder'
    );
    assert.ok(
      sanitized.includes('Bearer [REDACTED]'),
      'Should have Bearer placeholder'
    );
  });
});
