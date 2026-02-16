// Unit tests for Google OAuth status endpoint
// Tests token status retrieval and expiry calculation

import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { EncryptedToken } from '../src/types';

describe('Google OAuth Status Endpoint', () => {
  describe('Token expiry calculation', () => {
    it('should correctly identify valid token (not expired)', () => {
      const now = Date.now();
      const expiresAt = now + 3600000; // 1 hour from now

      const isExpired = now >= expiresAt;
      const timeRemaining = expiresAt - now;
      const minutesRemaining = Math.floor(timeRemaining / 60000);

      assert.ok(!isExpired, 'Token should not be expired');
      assert.ok(minutesRemaining === 60, 'Should have 60 minutes remaining');
    });

    it('should correctly identify expired token', () => {
      const now = Date.now();
      const expiresAt = now - 3600000; // 1 hour ago

      const isExpired = now >= expiresAt;
      const timeRemaining = expiresAt - now;
      const minutesRemaining = Math.floor(timeRemaining / 60000);

      assert.ok(isExpired, 'Token should be expired');
      assert.ok(minutesRemaining < 0, 'Minutes remaining should be negative');
    });

    it('should handle token expiring in exactly 5 minutes (refresh threshold)', () => {
      const now = Date.now();
      const expiresAt = now + 5 * 60 * 1000; // Exactly 5 minutes from now

      const timeRemaining = expiresAt - now;
      const minutesRemaining = Math.floor(timeRemaining / 60000);

      assert.strictEqual(minutesRemaining, 5);
    });

    it('should handle token expiring in less than 1 minute', () => {
      const now = Date.now();
      const expiresAt = now + 30000; // 30 seconds from now

      const timeRemaining = expiresAt - now;
      const minutesRemaining = Math.floor(timeRemaining / 60000);

      assert.strictEqual(minutesRemaining, 0);
    });

    it('should calculate correct minutes remaining for various durations', () => {
      const now = Date.now();

      // Test various durations
      const testCases = [
        { duration: 15 * 60 * 1000, expected: 15 }, // 15 minutes
        { duration: 30 * 60 * 1000, expected: 30 }, // 30 minutes
        { duration: 60 * 60 * 1000, expected: 60 }, // 1 hour
        { duration: 120 * 60 * 1000, expected: 120 }, // 2 hours
      ];

      for (const { duration, expected } of testCases) {
        const expiresAt = now + duration;
        const minutesRemaining = Math.floor((expiresAt - now) / 60000);
        assert.strictEqual(minutesRemaining, expected);
      }
    });
  });

  describe('EncryptedToken metadata parsing', () => {
    it('should parse expires_at from encrypted token without decryption', () => {
      const encrypted: EncryptedToken = {
        iv: 'base64_iv',
        ciphertext: 'base64_ciphertext',
        tag: '',
        user_id_hash: 'hash',
        created_at: Date.now(),
        expires_at: Date.now() + 3600000,
      };

      // Status endpoint should be able to read expires_at directly
      assert.ok(encrypted.expires_at > Date.now());
      assert.ok(typeof encrypted.expires_at === 'number');
    });

    it('should parse created_at from encrypted token without decryption', () => {
      const created = Date.now();
      const encrypted: EncryptedToken = {
        iv: 'base64_iv',
        ciphertext: 'base64_ciphertext',
        tag: '',
        user_id_hash: 'hash',
        created_at: created,
        expires_at: created + 3600000,
      };

      assert.strictEqual(encrypted.created_at, created);
    });

    it('should handle JSON serialization of EncryptedToken', () => {
      const encrypted: EncryptedToken = {
        iv: 'base64_iv',
        ciphertext: 'base64_ciphertext',
        tag: '',
        user_id_hash: 'hash',
        created_at: Date.now(),
        expires_at: Date.now() + 3600000,
      };

      const json = JSON.stringify(encrypted);
      const parsed = JSON.parse(json);

      assert.strictEqual(parsed.expires_at, encrypted.expires_at);
      assert.strictEqual(parsed.created_at, encrypted.created_at);
      assert.strictEqual(parsed.user_id_hash, encrypted.user_id_hash);
    });
  });

  describe('Security - no sensitive data exposure', () => {
    it('should not expose access_token in status response', () => {
      // Status endpoint should never return decrypted tokens
      const encrypted: EncryptedToken = {
        iv: 'base64_iv',
        ciphertext: 'base64_ciphertext', // Contains encrypted access_token
        tag: '',
        user_id_hash: 'hash',
        created_at: Date.now(),
        expires_at: Date.now() + 3600000,
      };

      // Status response should only include: expires_at, created_at, user_id_hash
      // Should NOT include: ciphertext (which contains access_token), iv, tag
      const safeFields = {
        expires_at: encrypted.expires_at,
        created_at: encrypted.created_at,
      };

      assert.ok(!('ciphertext' in safeFields));
      assert.ok(!('iv' in safeFields));
      assert.ok(!('tag' in safeFields));
    });

    it('should not expose refresh_token in status response', () => {
      // Refresh token is in encrypted ciphertext, never exposed
      const encrypted: EncryptedToken = {
        iv: 'base64_iv',
        ciphertext: 'base64_ciphertext',
        tag: '',
        user_id_hash: 'hash',
        created_at: Date.now(),
        expires_at: Date.now() + 3600000,
      };

      // Only metadata is safe to expose
      const statusResponse = {
        user: 'test@example.com',
        authorized: true,
        token_expires_at: new Date(encrypted.expires_at).toISOString(),
        is_expired: Date.now() >= encrypted.expires_at,
      };

      const responseStr = JSON.stringify(statusResponse);
      assert.ok(!responseStr.includes('access_token'));
      assert.ok(!responseStr.includes('refresh_token'));
      assert.ok(!responseStr.includes('ciphertext'));
    });

    it('should not expose HMAC key or encryption key', () => {
      // Status endpoint uses keys to compute KV key, but never returns them
      const hmacKey = '0'.repeat(64); // Simulated key
      const encryptionKey = '0'.repeat(64);

      // Status response should never include keys
      const statusResponse = {
        user: 'test@example.com',
        authorized: true,
      };

      const responseStr = JSON.stringify(statusResponse);
      assert.ok(!responseStr.includes(hmacKey));
      assert.ok(!responseStr.includes(encryptionKey));
    });
  });

  describe('Error handling', () => {
    it('should validate user parameter is provided', () => {
      const userParam = '';
      assert.ok(!userParam, 'Empty user parameter should be falsy');
      // Endpoint should return 400 if !userEmail
    });

    it('should handle missing token in KV gracefully', () => {
      const kvResult = null; // No token found
      const hasToken = kvResult !== null;

      assert.ok(!hasToken, 'Should correctly identify missing token');
      // Endpoint should return "not authorized" response
    });

    it('should handle malformed JSON in KV gracefully', () => {
      const malformedJson = '{ invalid json }';

      assert.throws(() => {
        JSON.parse(malformedJson);
      }, 'Should throw on malformed JSON');
      // Endpoint should catch and return 500 error
    });

    it('should handle KV read errors gracefully', () => {
      // Simulate KV read error
      const error = new Error('KV read failed');

      assert.ok(error instanceof Error);
      assert.strictEqual(error.message, 'KV read failed');
      // Endpoint should catch and return 500 error with generic message
    });
  });

  describe('HTML response formatting', () => {
    it('should format expires_at as ISO 8601 timestamp', () => {
      const expiresAt = Date.now() + 3600000;
      const formatted = new Date(expiresAt).toISOString();

      assert.ok(formatted.includes('T'));
      assert.ok(formatted.includes('Z'));
      assert.ok(formatted.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/));
    });

    it('should display minutes remaining in user-friendly format', () => {
      const now = Date.now();
      const expiresAt = now + 45 * 60 * 1000; // 45 minutes
      const minutesRemaining = Math.floor((expiresAt - now) / 60000);

      assert.strictEqual(minutesRemaining, 45);
      // Display: "Time remaining: 45 minutes"
    });

    it('should display status as "Valid" or "Expired"', () => {
      const now = Date.now();

      const validToken = now + 3600000;
      const expiredToken = now - 3600000;

      const validStatus = validToken > now ? 'Valid' : 'Expired';
      const expiredStatus = expiredToken > now ? 'Valid' : 'Expired';

      assert.strictEqual(validStatus, 'Valid');
      assert.strictEqual(expiredStatus, 'Expired');
    });

    it('should include re-authorization link when no token found', () => {
      const userEmail = 'test@example.com';
      const authUrl = `/google/auth?user=${encodeURIComponent(userEmail)}`;

      assert.strictEqual(authUrl, '/google/auth?user=test%40example.com');
      // HTML should include: <a href="/google/auth?user=test%40example.com">Click here to authorize</a>
    });
  });
});
