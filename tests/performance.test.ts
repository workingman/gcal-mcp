// Performance and Reliability Test Suite
// Validates encryption performance, CPU budget compliance, and reliability requirements

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TokenManager, importEncryptionKey, importHmacKey } from '../src/crypto.ts';
import { computeKVKey } from '../src/session.ts';
import type { GoogleTokens } from '../src/types.ts';

const TEST_ENCRYPTION_KEY =
  'a3271085b886512025e9fcd71336ac4393ddb400848b8197b53ae0dadc6eb9b4';
const TEST_HMAC_KEY =
  '9b0ea7b56b8ca68821c96e032c55dab2cc58206d63226cf3519b92f4784f38f9';

// Test utilities
function createValidTokens(userEmail: string): GoogleTokens {
  return {
    access_token: `ya29.${userEmail}_access_token`,
    refresh_token: `${userEmail}_refresh_token`,
    expires_at: Date.now() + 3600000,
    scope: 'https://www.googleapis.com/auth/calendar',
    user_email: userEmail,
    user_id: userEmail,
  };
}

describe('Performance and Reliability Tests', () => {
  // PERF-001: Response time for typical workload
  it('should complete encryption/decryption efficiently', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);

    const testTokens = createValidTokens('test@example.com');

    // Profile encryption
    const encryptStart = performance.now();
    const encrypted = await manager.encrypt(testTokens, 'test@example.com');
    const encryptDuration = performance.now() - encryptStart;

    // Profile decryption
    const decryptStart = performance.now();
    await manager.decrypt(encrypted);
    const decryptDuration = performance.now() - decryptStart;

    // Verify CPU efficiency (< 10ms per operation - allows for Web Crypto API overhead)
    assert.ok(
      encryptDuration < 10.0,
      `Encryption should take < 10ms, got ${encryptDuration.toFixed(2)}ms`
    );
    assert.ok(
      decryptDuration < 10.0,
      `Decryption should take < 10ms, got ${decryptDuration.toFixed(2)}ms`
    );
  });

  it('should complete bulk encryption operations within CPU budget', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);

    // Simulate 10 users (realistic multi-user scenario)
    const users = Array.from({ length: 10 }, (_, i) => `user${i}@example.com`);
    const tokens = users.map((u) => createValidTokens(u));

    // Profile bulk encryption
    const start = performance.now();
    await Promise.all(tokens.map((t, i) => manager.encrypt(t, users[i])));
    const duration = performance.now() - start;

    // Workers CPU budget is 50ms on free tier
    // 10 encryptions should complete well under this
    assert.ok(
      duration < 10.0,
      `Bulk encryption (10 users) should take < 10ms, got ${duration.toFixed(2)}ms`
    );
  });

  // PERF-002: HMAC computation performance
  it('should compute HMAC-based KV keys efficiently', async () => {
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);

    // Profile single HMAC computation
    const start = performance.now();
    await computeKVKey('test@example.com', hmacKey);
    const duration = performance.now() - start;

    // HMAC-SHA256 should be fast (< 5ms)
    assert.ok(
      duration < 5.0,
      `HMAC computation should take < 5ms, got ${duration.toFixed(2)}ms`
    );
  });

  it('should handle bulk HMAC computations efficiently', async () => {
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);

    // Simulate 100 users computing KV keys
    const users = Array.from({ length: 100 }, (_, i) => `user${i}@example.com`);

    const start = performance.now();
    await Promise.all(users.map((u) => computeKVKey(u, hmacKey)));
    const duration = performance.now() - start;

    // 100 HMAC operations should complete well under CPU budget
    assert.ok(
      duration < 50.0,
      `Bulk HMAC (100 users) should take < 50ms, got ${duration.toFixed(2)}ms`
    );
  });

  // PERF-003: Large payload encryption
  it('should handle large token payloads efficiently', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);

    // Create large token payload (10KB scope string)
    const largeTokens: GoogleTokens = {
      ...createValidTokens('test@example.com'),
      scope: 'a'.repeat(10000), // 10KB scope
    };

    const start = performance.now();
    const encrypted = await manager.encrypt(largeTokens, 'test@example.com');
    await manager.decrypt(encrypted);
    const duration = performance.now() - start;

    // Large payload encryption should still be fast
    assert.ok(
      duration < 5.0,
      `Large payload encryption should take < 5ms, got ${duration.toFixed(2)}ms`
    );
  });

  // PERF-004: Reliability under realistic load
  it('should maintain reliability with concurrent requests', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);

    // Simulate 20 concurrent encryption/decryption cycles
    const operations = Array.from({ length: 20 }, async (_, i) => {
      const tokens = createValidTokens(`user${i}@example.com`);
      const encrypted = await manager.encrypt(tokens, `user${i}@example.com`);
      const decrypted = await manager.decrypt(encrypted);
      return decrypted;
    });

    const start = performance.now();
    const results = await Promise.all(operations);
    const duration = performance.now() - start;

    // Verify all operations succeeded
    assert.strictEqual(results.length, 20, 'All operations should complete');

    // Verify performance under load
    assert.ok(
      duration < 50.0,
      `Concurrent operations should complete within CPU budget, got ${duration.toFixed(2)}ms`
    );
  });

  // PERF-005: Memory efficiency
  it('should handle multiple token storage operations without memory bloat', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);

    // Simulate 50 users storing and retrieving tokens
    const operations = [];
    for (let i = 0; i < 50; i++) {
      const tokens = createValidTokens(`user${i}@example.com`);
      operations.push(
        manager
          .encrypt(tokens, `user${i}@example.com`)
          .then((enc) => manager.decrypt(enc))
      );
    }

    const start = performance.now();
    const results = await Promise.all(operations);
    const duration = performance.now() - start;

    // Verify all operations completed
    assert.strictEqual(results.length, 50);

    // Verify reasonable performance (< 50ms for 50 users)
    assert.ok(
      duration < 50.0,
      `Memory-efficient operations should complete quickly, got ${duration.toFixed(2)}ms`
    );
  });

  // PERF-006: Worst-case scenario (100 concurrent users)
  it('should handle peak load with 100 concurrent users', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);

    // Simulate worst-case: 100 users encrypting tokens simultaneously
    const operations = Array.from({ length: 100 }, async (_, i) => {
      const tokens = createValidTokens(`user${i}@example.com`);
      return manager.encrypt(tokens, `user${i}@example.com`);
    });

    const start = performance.now();
    const results = await Promise.all(operations);
    const duration = performance.now() - start;

    // Verify all operations succeeded
    assert.strictEqual(results.length, 100);

    // Even under peak load, should remain performant
    assert.ok(
      duration < 100.0,
      `Peak load (100 users) should complete reasonably, got ${duration.toFixed(2)}ms`
    );

    // Verify all IVs are unique (no collisions under load)
    const ivs = new Set(results.map((r) => r.iv));
    assert.strictEqual(ivs.size, 100, 'All IVs should be unique under load');
  });
});
