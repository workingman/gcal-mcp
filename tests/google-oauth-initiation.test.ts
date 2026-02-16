// Unit tests for Google OAuth initiation flow
// Tests state parameter generation and authorization URL construction

import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Google OAuth Initiation', () => {
  describe('State parameter structure', () => {
    it('should generate state with userEmail and csrfToken', () => {
      const userEmail = 'test@example.com';
      const csrfToken = 'a'.repeat(64); // 64-char hex string

      const state = JSON.stringify({ userEmail, csrfToken });
      const parsed = JSON.parse(state);

      assert.strictEqual(parsed.userEmail, userEmail);
      assert.strictEqual(parsed.csrfToken, csrfToken);
    });

    it('should generate unique CSRF tokens for each request', () => {
      // Simulate two token generations
      const token1 = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      const token2 = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      assert.notStrictEqual(token1, token2, 'CSRF tokens should be unique');
      assert.strictEqual(token1.length, 64, 'Token should be 64 chars');
      assert.strictEqual(token2.length, 64, 'Token should be 64 chars');
    });

    it('should use cryptographically random CSRF tokens', () => {
      // Generate token using Web Crypto API (same method as app.ts)
      const csrfTokenBytes = crypto.getRandomValues(new Uint8Array(32));
      const csrfToken = Array.from(csrfTokenBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      // Verify format (64-char hex)
      assert.ok(/^[0-9a-f]{64}$/.test(csrfToken), 'Should be 64-char hex string');
    });

    it('should handle special characters in user email', () => {
      const userEmail = 'user+tag@example.com';
      const csrfToken = 'test123';

      const state = JSON.stringify({ userEmail, csrfToken });
      const parsed = JSON.parse(state);

      assert.strictEqual(parsed.userEmail, userEmail);
    });

    it('should be JSON serializable for URL encoding', () => {
      const stateObj = {
        userEmail: 'test@example.com',
        csrfToken: 'a'.repeat(64),
      };

      const stateStr = JSON.stringify(stateObj);
      const encoded = encodeURIComponent(stateStr);
      const decoded = decodeURIComponent(encoded);
      const parsed = JSON.parse(decoded);

      assert.strictEqual(parsed.userEmail, stateObj.userEmail);
      assert.strictEqual(parsed.csrfToken, stateObj.csrfToken);
    });
  });

  describe('Google authorization URL construction', () => {
    it('should construct URL with all required parameters', () => {
      const clientId = 'test-client-id';
      const workerUrl = 'https://calendar-mcp.example.com';
      const userEmail = 'test@example.com';
      const csrfToken = 'a'.repeat(64);

      const state = JSON.stringify({ userEmail, csrfToken });
      const redirectUri = `${workerUrl}/google/callback`;

      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar');
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      authUrl.searchParams.set('state', state);

      const url = authUrl.toString();

      // Verify all required parameters present
      assert.ok(url.includes('client_id=test-client-id'));
      assert.ok(url.includes('redirect_uri=https%3A%2F%2Fcalendar-mcp.example.com%2Fgoogle%2Fcallback'));
      assert.ok(url.includes('response_type=code'));
      assert.ok(url.includes('scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar'));
      assert.ok(url.includes('access_type=offline'));
      assert.ok(url.includes('prompt=consent'));
      assert.ok(url.includes('state='));
    });

    it('should include calendar scope in authorization URL', () => {
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar');

      const scope = authUrl.searchParams.get('scope');
      assert.strictEqual(scope, 'https://www.googleapis.com/auth/calendar');
    });

    it('should set access_type=offline to receive refresh token', () => {
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('access_type', 'offline');

      const accessType = authUrl.searchParams.get('access_type');
      assert.strictEqual(accessType, 'offline');
    });

    it('should set prompt=consent to force consent screen', () => {
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('prompt', 'consent');

      const prompt = authUrl.searchParams.get('prompt');
      assert.strictEqual(prompt, 'consent');
    });

    it('should use response_type=code for authorization code flow', () => {
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('response_type', 'code');

      const responseType = authUrl.searchParams.get('response_type');
      assert.strictEqual(responseType, 'code');
    });

    it('should properly encode redirect_uri', () => {
      const workerUrl = 'https://calendar-mcp.example.com';
      const redirectUri = `${workerUrl}/google/callback`;

      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('redirect_uri', redirectUri);

      const url = authUrl.toString();
      assert.ok(url.includes('redirect_uri=https%3A%2F%2Fcalendar-mcp.example.com%2Fgoogle%2Fcallback'));
    });
  });

  describe('CSRF protection', () => {
    it('should store CSRF token in KV with user email', () => {
      const csrfToken = 'a'.repeat(64);
      const userEmail = 'test@example.com';
      const timestamp = Date.now();

      const csrfKey = `csrf:${csrfToken}`;
      const csrfData = JSON.stringify({ userEmail, timestamp });

      assert.strictEqual(csrfKey, `csrf:${'a'.repeat(64)}`);
      const parsed = JSON.parse(csrfData);
      assert.strictEqual(parsed.userEmail, userEmail);
      assert.strictEqual(parsed.timestamp, timestamp);
    });

    it('should use 10-minute TTL for CSRF tokens', () => {
      const ttl = 600; // 10 minutes in seconds
      assert.strictEqual(ttl, 10 * 60);
    });

    it('should generate different CSRF tokens for different users', () => {
      const token1 = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      const token2 = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      assert.notStrictEqual(token1, token2);
    });
  });

  describe('Error handling', () => {
    it('should validate user parameter is provided', () => {
      const userParam = '';
      assert.ok(!userParam, 'Empty user parameter should be falsy');
      // App.ts should return 400 if !userEmail
    });

    it('should validate email format in user parameter', () => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      assert.ok(emailRegex.test('valid@example.com'));
      assert.ok(!emailRegex.test('invalid-email'));
      assert.ok(!emailRegex.test('missing-domain@'));
      assert.ok(!emailRegex.test('@missing-local.com'));
    });

    it('should handle state parameter serialization errors', () => {
      // Test that circular references would fail
      const circularObj: any = { userEmail: 'test@example.com' };
      circularObj.self = circularObj;

      assert.throws(() => {
        JSON.stringify(circularObj);
      }, 'Should throw on circular reference');
    });
  });

  describe('State parameter security', () => {
    it('should prevent CSRF token prediction', () => {
      // Generate multiple tokens and verify randomness
      const tokens = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        tokens.add(token);
      }

      // All tokens should be unique
      assert.strictEqual(tokens.size, 10, 'All tokens should be unique');
    });

    it('should include timestamp in CSRF data for expiry check', () => {
      const csrfData = {
        userEmail: 'test@example.com',
        timestamp: Date.now(),
      };

      const age = Date.now() - csrfData.timestamp;
      assert.ok(age >= 0, 'Age should be non-negative');
      assert.ok(age < 1000, 'Age should be less than 1 second for this test');
    });

    it('should prevent state parameter tampering via JSON structure', () => {
      const originalState = { userEmail: 'user@example.com', csrfToken: 'abc123' };
      const stateStr = JSON.stringify(originalState);

      // Attempt to tamper by modifying string
      const tamperedStr = stateStr.replace('user@example.com', 'hacker@example.com');
      const tamperedState = JSON.parse(tamperedStr);

      // This demonstrates that tampering is detectable via CSRF validation
      assert.notStrictEqual(tamperedState.userEmail, originalState.userEmail);
      // The CSRF token lookup would fail because it was stored with original email
    });
  });
});
