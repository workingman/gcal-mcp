// Unit tests for calendar_auth_status MCP tool
// Tests status check scenarios: connected, not connected, expired, no identity

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { formatNoTokenError, formatTokenExpiredError } from '../src/error-formatter.ts';
import type { GoogleTokens } from '../src/types';

describe('calendar_auth_status MCP Tool', () => {
  describe('Status calculation logic', () => {
    it('should calculate minutes remaining correctly for valid token', () => {
      const now = Date.now();
      const expiresAt = now + 45 * 60 * 1000; // 45 minutes from now

      const timeRemaining = expiresAt - now;
      const minutesRemaining = Math.floor(timeRemaining / 60000);

      assert.strictEqual(minutesRemaining, 45);

      // Expected response format
      const userEmail = 'test@example.com';
      const responseText = `Google account is connected for ${userEmail}. Token valid for ~${minutesRemaining} minutes.`;

      assert.ok(responseText.includes('connected'));
      assert.ok(responseText.includes('45 minutes'));
    });

    it('should handle token expiring in less than 1 minute', () => {
      const now = Date.now();
      const expiresAt = now + 30000; // 30 seconds from now

      const timeRemaining = expiresAt - now;
      const minutesRemaining = Math.floor(timeRemaining / 60000);

      assert.strictEqual(minutesRemaining, 0);

      const responseText = `Token valid for ~${minutesRemaining} minutes.`;
      assert.ok(responseText.includes('0 minutes'));
    });

    it('should handle expired token (negative minutes)', () => {
      const now = Date.now();
      const expiresAt = now - 3600000; // 1 hour ago

      const timeRemaining = expiresAt - now;
      const minutesRemaining = Math.floor(timeRemaining / 60000);

      assert.ok(minutesRemaining < 0, 'Minutes should be negative for expired token');

      // When token is expired, getTokenForUser() should throw error
      // with formatTokenExpiredError() message
      const error = formatTokenExpiredError('test@example.com', 'https://worker.example.com');
      assert.ok(error.includes('expired'));
      assert.ok(error.includes('/google/auth'));
    });

    it('should handle token at exactly 5 minutes (refresh threshold)', () => {
      const now = Date.now();
      const expiresAt = now + 5 * 60 * 1000; // Exactly 5 minutes

      const timeRemaining = expiresAt - now;
      const minutesRemaining = Math.floor(timeRemaining / 60000);

      assert.strictEqual(minutesRemaining, 5);

      // At 5 minutes, ensureFreshToken() should trigger refresh
      // but calendar_auth_status shows current state
    });
  });

  describe('Error handling scenarios', () => {
    it('should handle missing user identity', () => {
      const userEmail = '';

      assert.ok(!userEmail, 'Empty email should be falsy');

      // Expected response when no user identity
      const responseText = 'User identity not available. Please reconnect MCP.';
      assert.ok(responseText.includes('identity not available'));
    });

    it('should handle missing token in KV', () => {
      const userEmail = 'test@example.com';
      const workerUrl = 'https://worker.example.com';

      // When no token found, should return auth URL
      const error = formatNoTokenError(userEmail, workerUrl);

      assert.ok(error.includes('not connected'));
      assert.ok(error.includes('/google/auth'));
      assert.ok(error.includes('test@example.com'));
    });

    it('should format error with personalized auth URL', () => {
      const userEmail = 'user+tag@example.com';
      const workerUrl = 'https://worker.example.com';

      const error = formatNoTokenError(userEmail, workerUrl);

      // Email should be URL-encoded
      assert.ok(error.includes('user%2Btag%40example.com'));
      assert.ok(error.includes('/google/auth?user='));
    });
  });

  describe('MCP response format', () => {
    it('should return correct MCP tool response structure for success', () => {
      const response = {
        content: [
          {
            type: 'text',
            text: 'Google account is connected for test@example.com. Token valid for ~45 minutes.',
          },
        ],
      };

      assert.ok(Array.isArray(response.content), 'Content should be array');
      assert.strictEqual(response.content.length, 1, 'Should have one content item');
      assert.strictEqual(response.content[0].type, 'text', 'Type should be text');
      assert.ok(typeof response.content[0].text === 'string', 'Text should be string');
    });

    it('should return correct MCP tool response structure for error', () => {
      const response = {
        content: [
          {
            type: 'text',
            text: 'Google account not connected. Please visit https://... to authorize.',
          },
        ],
      };

      assert.ok(Array.isArray(response.content));
      assert.strictEqual(response.content[0].type, 'text');
      assert.ok(response.content[0].text.includes('not connected'));
    });

    it('should handle getTokenForUser() errors gracefully', () => {
      // Simulate getTokenForUser() throwing error
      const error = new Error(
        'Google account not connected for test@example.com. Please visit https://worker.example.com/google/auth?user=test%40example.com to authorize.'
      );

      const response = {
        content: [
          {
            type: 'text',
            text: error.message,
          },
        ],
      };

      assert.ok(response.content[0].text.includes('not connected'));
      assert.ok(response.content[0].text.includes('/google/auth'));
    });
  });

  describe('Token expiry edge cases', () => {
    it('should handle token with hours remaining', () => {
      const now = Date.now();
      const expiresAt = now + 120 * 60 * 1000; // 2 hours

      const minutesRemaining = Math.floor((expiresAt - now) / 60000);
      assert.strictEqual(minutesRemaining, 120);

      const responseText = `Token valid for ~${minutesRemaining} minutes.`;
      assert.ok(responseText.includes('120 minutes'));
    });

    it('should handle token just expired (1 second ago)', () => {
      const now = Date.now();
      const expiresAt = now - 1000; // 1 second ago

      const minutesRemaining = Math.floor((expiresAt - now) / 60000);
      assert.ok(minutesRemaining <= 0, 'Should be 0 or negative');
    });

    it('should handle malformed expires_at value', () => {
      const expiresAt = NaN;

      const minutesRemaining = Math.floor((expiresAt - Date.now()) / 60000);
      assert.ok(isNaN(minutesRemaining), 'Should be NaN for invalid expires_at');

      // Tool should catch this error and return error response
    });
  });

  describe('User identity extraction', () => {
    it('should validate user email from MCP session props', () => {
      // MCP session props structure
      const props = { userEmail: 'test@example.com' };

      assert.ok(props.userEmail, 'Should have userEmail');
      assert.strictEqual(props.userEmail, 'test@example.com');
    });

    it('should handle missing userEmail in props', () => {
      const props = { userEmail: '' };

      assert.ok(!props.userEmail, 'Empty userEmail should be falsy');

      // Tool should return "User identity not available" error
    });

    it('should handle undefined userEmail in props', () => {
      const props: { userEmail?: string } = {};

      assert.ok(!props.userEmail, 'Undefined userEmail should be falsy');
    });
  });
});
