// Security Validation Test Suite
// Validates PRD SEC-001, SEC-002, SEC-004 compliance
// Tests encrypted token storage, multi-user isolation, session hijacking prevention

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TokenManager, importEncryptionKey, importHmacKey } from '../src/crypto.ts';
import { computeKVKey } from '../src/session.ts';
import { storeEncryptedToken, retrieveEncryptedToken } from '../src/kv-storage.ts';
import type { GoogleTokens, EncryptedToken } from '../src/types.ts';

const TEST_ENCRYPTION_KEY =
  'a3271085b886512025e9fcd71336ac4393ddb400848b8197b53ae0dadc6eb9b4';
const TEST_HMAC_KEY =
  '9b0ea7b56b8ca68821c96e032c55dab2cc58206d63226cf3519b92f4784f38f9';

// Mock KVNamespace
class MockKV {
  private storage = new Map<string, string>();

  async put(key: string, value: string): Promise<void> {
    this.storage.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.storage.get(key) || null;
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async list(): Promise<{ keys: Array<{ name: string }> }> {
    return {
      keys: Array.from(this.storage.keys()).map((name) => ({ name })),
    };
  }

  clear(): void {
    this.storage.clear();
  }

  // Additional methods for inspection
  getRawValue(key: string): string | undefined {
    return this.storage.get(key);
  }

  getAllKeys(): string[] {
    return Array.from(this.storage.keys());
  }
}

describe('Security Validation Tests', () => {
  // SEC-001: Encrypted Token Storage Validation
  it('should store tokens as encrypted ciphertext (not plaintext JSON)', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);
    const kv = new MockKV() as unknown as KVNamespace;

    const testTokens: GoogleTokens = {
      access_token: 'ya29.secret_access_token_12345',
      refresh_token: 'secret_refresh_token_67890',
      expires_at: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/calendar',
      user_email: 'test@example.com',
      user_id: 'test@example.com',
    };

    await storeEncryptedToken('test@example.com', testTokens, manager, hmacKey, kv);

    // Inspect raw KV value
    const kvKey = await computeKVKey('test@example.com', hmacKey);
    const rawValue = (kv as unknown as MockKV).getRawValue(kvKey);

    assert.ok(rawValue, 'Token should be stored in KV');

    // Parse encrypted token structure
    const stored: EncryptedToken = JSON.parse(rawValue!);

    // Verify ciphertext is base64-encoded (not plaintext)
    assert.ok(stored.ciphertext, 'Ciphertext field should exist');
    assert.ok(stored.iv, 'IV field should exist');
    assert.ok(/^[A-Za-z0-9+/]+=*$/.test(stored.ciphertext), 'Ciphertext should be base64');
    assert.ok(/^[A-Za-z0-9+/]+=*$/.test(stored.iv), 'IV should be base64');

    // Verify plaintext tokens are NOT in raw KV value
    assert.ok(
      !rawValue!.includes('ya29.secret_access_token'),
      'Access token should not appear in plaintext'
    );
    assert.ok(
      !rawValue!.includes('secret_refresh_token'),
      'Refresh token should not appear in plaintext'
    );

    // Verify ciphertext is not JSON-parseable (encrypted binary data)
    assert.throws(
      () => JSON.parse(stored.ciphertext),
      /Unexpected/,
      'Ciphertext should not be valid JSON'
    );
  });

  it('should generate unique IV for each encryption (no IV reuse)', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);
    const kv = new MockKV() as unknown as KVNamespace;

    const testTokens: GoogleTokens = {
      access_token: 'ya29.test_token',
      refresh_token: 'refresh_token',
      expires_at: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/calendar',
      user_email: 'test@example.com',
      user_id: 'test@example.com',
    };

    // Encrypt same tokens 10 times
    const ivSet = new Set<string>();
    const ciphertextSet = new Set<string>();

    for (let i = 0; i < 10; i++) {
      const encrypted = await manager.encrypt(testTokens, 'test@example.com');
      ivSet.add(encrypted.iv);
      ciphertextSet.add(encrypted.ciphertext);
    }

    // All IVs should be unique
    assert.strictEqual(ivSet.size, 10, 'All 10 IVs should be unique (no reuse)');

    // All ciphertexts should be unique (due to unique IVs)
    assert.strictEqual(
      ciphertextSet.size,
      10,
      'All 10 ciphertexts should be unique'
    );
  });

  it('should verify IV has correct length (12 bytes for GCM)', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);

    const testTokens: GoogleTokens = {
      access_token: 'ya29.test_token',
      refresh_token: 'refresh_token',
      expires_at: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/calendar',
      user_email: 'test@example.com',
      user_id: 'test@example.com',
    };

    const encrypted = await manager.encrypt(testTokens, 'test@example.com');

    // Decode base64 IV and verify length
    const ivBytes = Uint8Array.from(atob(encrypted.iv), (c) => c.charCodeAt(0));

    // GCM requires 12-byte IV (96 bits)
    assert.strictEqual(ivBytes.length, 12, 'IV should be exactly 12 bytes');
  });

  // SEC-002: Multi-User Isolation with Attack Scenarios
  it('should prevent User A from accessing User B tokens via KV key tampering', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);
    const kv = new MockKV() as unknown as KVNamespace;

    // User B stores token
    const userBTokens: GoogleTokens = {
      access_token: 'ya29.userB_secret_token',
      refresh_token: 'userB_refresh',
      expires_at: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/calendar',
      user_email: 'userb@example.com',
      user_id: 'userb@example.com',
    };

    await storeEncryptedToken('userb@example.com', userBTokens, manager, hmacKey, kv);

    // User A attempts to compute User B's KV key (requires HMAC key - not available to attacker)
    // Even if attacker has HMAC key (compromised), they still can't decrypt without encryption key

    // Simulate attack: User A tries to retrieve all KV keys and guess User B's
    const allKeys = (kv as unknown as MockKV).getAllKeys();
    assert.strictEqual(allKeys.length, 1, 'Only 1 key should be stored');

    // Attacker tries to retrieve token using User A's identity
    await assert.rejects(
      async () =>
        retrieveEncryptedToken('usera@example.com', manager, hmacKey, kv),
      /No token found/,
      'User A cannot access User B token (different KV key)'
    );
  });

  it('should reject cross-user token swap attack (User B KV key with User A token)', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);
    const kv = new MockKV() as unknown as KVNamespace;

    // User A stores token
    const userATokens: GoogleTokens = {
      access_token: 'ya29.userA_token',
      refresh_token: 'userA_refresh',
      expires_at: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/calendar',
      user_email: 'usera@example.com',
      user_id: 'usera@example.com',
    };

    await storeEncryptedToken('usera@example.com', userATokens, manager, hmacKey, kv);

    // Attacker retrieves User A's encrypted token
    const keyA = await computeKVKey('usera@example.com', hmacKey);
    const encryptedA = await kv.get(keyA);

    // Attacker stores User A's token under User B's KV key
    const keyB = await computeKVKey('userb@example.com', hmacKey);
    await kv.put(keyB, encryptedA!);

    // User B tries to retrieve - should fail validation
    await assert.rejects(
      async () =>
        retrieveEncryptedToken('userb@example.com', manager, hmacKey, kv),
      /Session validation failed/,
      'Cross-user token swap should be rejected (user_id_hash mismatch)'
    );
  });

  // SEC-004: Credential Leak Prevention
  it('should not leak encryption keys in error messages', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);

    const testTokens: GoogleTokens = {
      access_token: 'ya29.test_token',
      refresh_token: 'refresh_token',
      expires_at: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/calendar',
      user_email: 'test@example.com',
      user_id: 'test@example.com',
    };

    const encrypted = await manager.encrypt(testTokens, 'test@example.com');

    // Tamper with ciphertext to trigger decryption error
    const tampered = {
      ...encrypted,
      ciphertext: encrypted.ciphertext.slice(0, -4) + 'XXXX',
    };

    try {
      await manager.decrypt(tampered);
      assert.fail('Should have thrown decryption error');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Verify encryption key hex is not in error message
      assert.ok(
        !errorMsg.includes(TEST_ENCRYPTION_KEY),
        'Encryption key should not leak in error message'
      );

      // Verify HMAC key is not in error message
      assert.ok(
        !errorMsg.includes(TEST_HMAC_KEY),
        'HMAC key should not leak in error message'
      );

      // Verify error message is generic
      assert.ok(
        errorMsg.includes('Token decryption failed'),
        'Error should have generic message'
      );
    }
  });

  it('should not leak plaintext tokens in error messages', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);
    const kv = new MockKV() as unknown as KVNamespace;

    const testTokens: GoogleTokens = {
      access_token: 'ya29.super_secret_token_should_not_leak',
      refresh_token: 'super_secret_refresh_should_not_leak',
      expires_at: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/calendar',
      user_email: 'test@example.com',
      user_id: 'test@example.com',
    };

    await storeEncryptedToken('test@example.com', testTokens, manager, hmacKey, kv);

    // Trigger validation error by requesting with different user
    try {
      await retrieveEncryptedToken('attacker@example.com', manager, hmacKey, kv);
      assert.fail('Should have thrown validation error');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Verify tokens don't leak in error message
      assert.ok(
        !errorMsg.includes('super_secret_token'),
        'Access token should not leak in error'
      );
      assert.ok(
        !errorMsg.includes('super_secret_refresh'),
        'Refresh token should not leak in error'
      );
    }
  });

  // Additional Attack Scenarios
  it('should reject token with forged user_id_hash', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);
    const kv = new MockKV() as unknown as KVNamespace;

    // User A stores token
    const userATokens: GoogleTokens = {
      access_token: 'ya29.userA_token',
      refresh_token: 'userA_refresh',
      expires_at: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/calendar',
      user_email: 'usera@example.com',
      user_id: 'usera@example.com',
    };

    await storeEncryptedToken('usera@example.com', userATokens, manager, hmacKey, kv);

    // Attacker retrieves token and forges user_id_hash for User B
    const keyA = await computeKVKey('usera@example.com', hmacKey);
    const encryptedA = await kv.get(keyA);
    const parsedA: EncryptedToken = JSON.parse(encryptedA!);

    // Compute User B's user_id_hash and replace it
    const userBEncrypted = await manager.encrypt(
      { ...userATokens, user_id: 'userb@example.com' },
      'userb@example.com'
    );
    const forged: EncryptedToken = {
      ...parsedA,
      user_id_hash: userBEncrypted.user_id_hash, // Forged hash
    };

    // Store forged token under User B's key
    const keyB = await computeKVKey('userb@example.com', hmacKey);
    await kv.put(keyB, JSON.stringify(forged));

    // User B tries to retrieve - should fail ownership validation
    await assert.rejects(
      async () =>
        retrieveEncryptedToken('userb@example.com', manager, hmacKey, kv),
      /Token ownership validation failed/,
      'Forged user_id_hash should be rejected (embedded user_id mismatch)'
    );
  });

  it('should verify GCM authentication tag prevents ciphertext tampering', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);

    const testTokens: GoogleTokens = {
      access_token: 'ya29.test_token',
      refresh_token: 'refresh_token',
      expires_at: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/calendar',
      user_email: 'test@example.com',
      user_id: 'test@example.com',
    };

    const encrypted = await manager.encrypt(testTokens, 'test@example.com');

    // Tamper with ciphertext (flip a bit in the middle)
    const ciphertextBytes = Uint8Array.from(
      atob(encrypted.ciphertext),
      (c) => c.charCodeAt(0)
    );
    ciphertextBytes[Math.floor(ciphertextBytes.length / 2)] ^= 0x01; // Flip 1 bit

    const tamperedEncrypted = {
      ...encrypted,
      ciphertext: btoa(String.fromCharCode(...ciphertextBytes)),
    };

    // GCM authentication should detect tampering
    await assert.rejects(
      async () => manager.decrypt(tamperedEncrypted),
      /Token decryption failed/,
      'GCM should reject tampered ciphertext'
    );
  });
});
