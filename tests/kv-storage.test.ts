// Unit tests for KV storage utilities (kv-storage.ts)
import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { storeEncryptedToken, retrieveEncryptedToken } from '../src/kv-storage.ts';
import { TokenManager, importEncryptionKey, importHmacKey } from '../src/crypto.ts';
import { computeKVKey } from '../src/session.ts';
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

  clear(): void {
    this.storage.clear();
  }
}

describe('KV Storage Utilities', () => {
  it('should store encrypted token in KV with correct key format', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);
    const kv = new MockKV() as unknown as KVNamespace;

    const testTokens: GoogleTokens = {
      access_token: 'ya29.test_access_token',
      refresh_token: 'test_refresh_token',
      expires_at: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/calendar',
      user_email: 'test@example.com',
      user_id: 'test@example.com',
    };

    await storeEncryptedToken(
      'test@example.com',
      testTokens,
      manager,
      hmacKey,
      kv
    );

    // Verify token stored with correct key
    const kvKey = await computeKVKey('test@example.com', hmacKey);
    const stored = await kv.get(kvKey);

    assert.ok(stored, 'Token should be stored');
    const encrypted: EncryptedToken = JSON.parse(stored!);
    assert.ok(encrypted.iv, 'Stored token should have IV');
    assert.ok(encrypted.ciphertext, 'Stored token should have ciphertext');
    assert.ok(encrypted.user_id_hash, 'Stored token should have user_id_hash');
  });

  it('should retrieve and decrypt token successfully', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);
    const kv = new MockKV() as unknown as KVNamespace;

    const testTokens: GoogleTokens = {
      access_token: 'ya29.test_access_token',
      refresh_token: 'test_refresh_token',
      expires_at: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/calendar',
      user_email: 'test@example.com',
      user_id: 'test@example.com',
    };

    // Store token
    await storeEncryptedToken(
      'test@example.com',
      testTokens,
      manager,
      hmacKey,
      kv
    );

    // Retrieve token
    const retrieved = await retrieveEncryptedToken(
      'test@example.com',
      manager,
      hmacKey,
      kv
    );

    // Verify retrieved token matches original
    assert.strictEqual(retrieved.access_token, testTokens.access_token);
    assert.strictEqual(retrieved.refresh_token, testTokens.refresh_token);
    assert.strictEqual(retrieved.expires_at, testTokens.expires_at);
    assert.strictEqual(retrieved.scope, testTokens.scope);
    assert.strictEqual(retrieved.user_email, testTokens.user_email);
    assert.strictEqual(retrieved.user_id, testTokens.user_id);
  });

  it('should throw error when token not found', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);
    const kv = new MockKV() as unknown as KVNamespace;

    await assert.rejects(
      async () =>
        retrieveEncryptedToken('nonexistent@example.com', manager, hmacKey, kv),
      /No token found for user nonexistent@example.com/,
      'Should throw error when token not found'
    );
  });

  it('should throw error when encrypted token JSON is malformed', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);
    const kv = new MockKV() as unknown as KVNamespace;

    // Store malformed JSON
    const kvKey = await computeKVKey('test@example.com', hmacKey);
    await kv.put(kvKey, 'not valid json');

    await assert.rejects(
      async () =>
        retrieveEncryptedToken('test@example.com', manager, hmacKey, kv),
      /Token data is malformed/,
      'Should throw error for malformed JSON'
    );
  });

  it('should reject token with mismatched user_id_hash (session validation failure)', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);
    const kv = new MockKV() as unknown as KVNamespace;

    const testTokens: GoogleTokens = {
      access_token: 'ya29.test_access_token',
      refresh_token: 'test_refresh_token',
      expires_at: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/calendar',
      user_email: 'user1@example.com',
      user_id: 'user1@example.com',
    };

    // Store token for user1
    await storeEncryptedToken(
      'user1@example.com',
      testTokens,
      manager,
      hmacKey,
      kv
    );

    // Manually retrieve and modify user_id_hash to simulate tampering
    const kvKey = await computeKVKey('user1@example.com', hmacKey);
    const storedJson = await kv.get(kvKey);
    const encrypted: EncryptedToken = JSON.parse(storedJson!);

    // Tamper with user_id_hash
    encrypted.user_id_hash = 'tampered_hash_value';
    await kv.put(kvKey, JSON.stringify(encrypted));

    // Try to retrieve - should fail validation
    await assert.rejects(
      async () =>
        retrieveEncryptedToken('user1@example.com', manager, hmacKey, kv),
      /Session validation failed/,
      'Should reject tampered user_id_hash'
    );
  });

  it('should reject token with mismatched embedded user_id (ownership validation)', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);
    const kv = new MockKV() as unknown as KVNamespace;

    // Create token with user_id = user1, but store under user2's KV key
    const testTokens: GoogleTokens = {
      access_token: 'ya29.test_access_token',
      refresh_token: 'test_refresh_token',
      expires_at: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/calendar',
      user_email: 'user1@example.com',
      user_id: 'user1@example.com',
    };

    // Manually encrypt and store under wrong user's key
    const encrypted = await manager.encrypt(testTokens, 'user2@example.com');
    const kvKey = await computeKVKey('user2@example.com', hmacKey);
    await kv.put(kvKey, JSON.stringify(encrypted));

    // Try to retrieve as user2 - should fail ownership validation
    await assert.rejects(
      async () =>
        retrieveEncryptedToken('user2@example.com', manager, hmacKey, kv),
      /Token ownership validation failed/,
      'Should reject token with mismatched user_id'
    );
  });

  it('should handle decryption failures gracefully', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);
    const kv = new MockKV() as unknown as KVNamespace;

    const testTokens: GoogleTokens = {
      access_token: 'ya29.test_access_token',
      refresh_token: 'test_refresh_token',
      expires_at: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/calendar',
      user_email: 'test@example.com',
      user_id: 'test@example.com',
    };

    // Store token
    await storeEncryptedToken(
      'test@example.com',
      testTokens,
      manager,
      hmacKey,
      kv
    );

    // Corrupt ciphertext
    const kvKey = await computeKVKey('test@example.com', hmacKey);
    const storedJson = await kv.get(kvKey);
    const encrypted: EncryptedToken = JSON.parse(storedJson!);
    encrypted.ciphertext = 'corrupted_ciphertext';
    await kv.put(kvKey, JSON.stringify(encrypted));

    // Try to retrieve - should fail decryption
    await assert.rejects(
      async () =>
        retrieveEncryptedToken('test@example.com', manager, hmacKey, kv),
      /Failed to decrypt token/,
      'Should handle decryption failure'
    );
  });

  it('should support multi-user isolation', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);
    const kv = new MockKV() as unknown as KVNamespace;

    // Store tokens for multiple users
    const user1Tokens: GoogleTokens = {
      access_token: 'ya29.user1_token',
      refresh_token: 'user1_refresh',
      expires_at: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/calendar',
      user_email: 'user1@example.com',
      user_id: 'user1@example.com',
    };

    const user2Tokens: GoogleTokens = {
      access_token: 'ya29.user2_token',
      refresh_token: 'user2_refresh',
      expires_at: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/calendar',
      user_email: 'user2@example.com',
      user_id: 'user2@example.com',
    };

    await storeEncryptedToken(
      'user1@example.com',
      user1Tokens,
      manager,
      hmacKey,
      kv
    );
    await storeEncryptedToken(
      'user2@example.com',
      user2Tokens,
      manager,
      hmacKey,
      kv
    );

    // Retrieve tokens independently
    const retrieved1 = await retrieveEncryptedToken(
      'user1@example.com',
      manager,
      hmacKey,
      kv
    );
    const retrieved2 = await retrieveEncryptedToken(
      'user2@example.com',
      manager,
      hmacKey,
      kv
    );

    // Verify isolation
    assert.strictEqual(retrieved1.access_token, 'ya29.user1_token');
    assert.strictEqual(retrieved2.access_token, 'ya29.user2_token');
    assert.notStrictEqual(retrieved1.access_token, retrieved2.access_token);
  });
});
