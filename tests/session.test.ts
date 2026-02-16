// Unit tests for session validation utilities (session.ts)
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { computeKVKey, validateSession } from '../src/session.ts';
import { importHmacKey, importEncryptionKey, TokenManager } from '../src/crypto.ts';
import type { GoogleTokens } from '../src/types.ts';

// Test key (hex-encoded 32 bytes)
const TEST_HMAC_KEY =
  '9b0ea7b56b8ca68821c96e032c55dab2cc58206d63226cf3519b92f4784f38f9';
const TEST_ENCRYPTION_KEY =
  'a3271085b886512025e9fcd71336ac4393ddb400848b8197b53ae0dadc6eb9b4';

describe('Session Validation', () => {
  it('should compute KV key in correct format', async () => {
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const kvKey = await computeKVKey('test@example.com', hmacKey);

    // Should start with "google_tokens:"
    assert.ok(kvKey.startsWith('google_tokens:'), 'KV key should have correct prefix');

    // Hash part should be 64 hex characters
    const hashPart = kvKey.split(':')[1];
    assert.strictEqual(hashPart.length, 64, 'Hash should be 64 characters');
    assert.ok(/^[0-9a-f]{64}$/.test(hashPart), 'Hash should be valid hex');
  });

  it('should generate deterministic KV keys for same email', async () => {
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);

    const kvKey1 = await computeKVKey('test@example.com', hmacKey);
    const kvKey2 = await computeKVKey('test@example.com', hmacKey);

    assert.strictEqual(
      kvKey1,
      kvKey2,
      'KV keys should be deterministic for same email'
    );
  });

  it('should generate different KV keys for different emails', async () => {
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);

    const kvKey1 = await computeKVKey('user1@example.com', hmacKey);
    const kvKey2 = await computeKVKey('user2@example.com', hmacKey);

    assert.notStrictEqual(
      kvKey1,
      kvKey2,
      'KV keys should differ for different emails'
    );
  });

  it('should validate session when user_id matches', async () => {
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);

    const testTokens: GoogleTokens = {
      access_token: 'ya29.test',
      refresh_token: 'test_refresh',
      expires_at: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/calendar',
      user_email: 'test@example.com',
      user_id: 'test@example.com',
    };

    const userId = 'test@example.com';
    const encrypted = await manager.encrypt(testTokens, userId);

    // Validate with matching user
    const isValid = await validateSession(userId, encrypted, hmacKey);
    assert.strictEqual(isValid, true, 'Should validate matching user');
  });

  it('should reject session when user_id does not match', async () => {
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);

    const testTokens: GoogleTokens = {
      access_token: 'ya29.test',
      refresh_token: 'test_refresh',
      expires_at: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/calendar',
      user_email: 'user1@example.com',
      user_id: 'user1@example.com',
    };

    // Encrypt for user1
    const encrypted = await manager.encrypt(testTokens, 'user1@example.com');

    // Try to validate as user2
    const isValid = await validateSession('user2@example.com', encrypted, hmacKey);
    assert.strictEqual(
      isValid,
      false,
      'Should reject non-matching user'
    );
  });

  it('should log security events for validation results', async () => {
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);

    const testTokens: GoogleTokens = {
      access_token: 'ya29.test',
      refresh_token: 'test_refresh',
      expires_at: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/calendar',
      user_email: 'test@example.com',
      user_id: 'test@example.com',
    };

    const encrypted = await manager.encrypt(testTokens, 'test@example.com');

    // Capture console output (simplified - just verify no errors thrown)
    const originalLog = console.log;
    const originalWarn = console.warn;
    let logCalled = false;
    let warnCalled = false;

    console.log = (...args: unknown[]) => {
      if (args[0]?.toString().includes('[SECURITY]')) {
        logCalled = true;
      }
      originalLog(...args);
    };

    console.warn = (...args: unknown[]) => {
      if (args[0]?.toString().includes('[SECURITY]')) {
        warnCalled = true;
      }
      originalWarn(...args);
    };

    // Successful validation should log
    await validateSession('test@example.com', encrypted, hmacKey);
    assert.strictEqual(logCalled, true, 'Should log success event');

    // Failed validation should warn
    await validateSession('wrong@example.com', encrypted, hmacKey);
    assert.strictEqual(warnCalled, true, 'Should log warning event');

    // Restore console
    console.log = originalLog;
    console.warn = originalWarn;
  });
});
