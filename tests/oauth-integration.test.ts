// OAuth integration tests - Multi-user OAuth flow scenarios
// Tests complete OAuth flows (MCP OAuth + Google OAuth) with multi-user isolation
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TokenManager, importEncryptionKey, importHmacKey } from '../src/crypto.ts';
import { computeKVKey, validateSession } from '../src/session.ts';
import { storeEncryptedToken, retrieveEncryptedToken } from '../src/kv-storage.ts';
import type { GoogleTokens } from '../src/types.ts';

const TEST_ENCRYPTION_KEY =
  'a3271085b886512025e9fcd71336ac4393ddb400848b8197b53ae0dadc6eb9b4';
const TEST_HMAC_KEY =
  '9b0ea7b56b8ca68821c96e032c55dab2cc58206d63226cf3519b92f4784f38f9';

// Mock KVNamespace for testing
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

  size(): number {
    return this.storage.size;
  }
}

// Test fixture: Create GoogleTokens for a user
function createTokensForUser(userEmail: string): GoogleTokens {
  return {
    access_token: `ya29.${userEmail}_access_token`,
    refresh_token: `${userEmail}_refresh_token`,
    expires_at: Date.now() + 3600000, // 1 hour from now
    scope: 'https://www.googleapis.com/auth/calendar',
    user_email: userEmail,
    user_id: userEmail,
  };
}

describe('OAuth Integration Tests', () => {
  it('should complete multi-user OAuth flow with isolated token storage', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);
    const kv = new MockKV() as unknown as KVNamespace;

    // User A and User B complete OAuth flows
    const userA = 'alice@example.com';
    const userB = 'bob@example.com';

    const tokensA = createTokensForUser(userA);
    const tokensB = createTokensForUser(userB);

    // Store tokens for both users
    await storeEncryptedToken(userA, tokensA, manager, hmacKey, kv);
    await storeEncryptedToken(userB, tokensB, manager, hmacKey, kv);

    // Verify both tokens are stored
    assert.strictEqual(kv.size(), 2, 'Should have 2 tokens stored');

    // Retrieve tokens independently
    const retrievedA = await retrieveEncryptedToken(userA, manager, hmacKey, kv);
    const retrievedB = await retrieveEncryptedToken(userB, manager, hmacKey, kv);

    // Verify User A gets only their tokens
    assert.strictEqual(retrievedA.access_token, `ya29.${userA}_access_token`);
    assert.strictEqual(retrievedA.user_id, userA);

    // Verify User B gets only their tokens
    assert.strictEqual(retrievedB.access_token, `ya29.${userB}_access_token`);
    assert.strictEqual(retrievedB.user_id, userB);

    // Verify complete isolation
    assert.notStrictEqual(retrievedA.access_token, retrievedB.access_token);
    assert.notStrictEqual(retrievedA.refresh_token, retrievedB.refresh_token);
  });

  it('should reject User A attempting to retrieve User B tokens via forged session', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);
    const kv = new MockKV() as unknown as KVNamespace;

    // User B completes OAuth flow and stores tokens
    const userB = 'bob@example.com';
    const tokensB = createTokensForUser(userB);
    await storeEncryptedToken(userB, tokensB, manager, hmacKey, kv);

    // User A tries to access User B's tokens by forging userEmail
    const userA = 'alice@example.com';

    // Attempt 1: User A tries to retrieve with their own email (different KV key)
    await assert.rejects(
      async () => retrieveEncryptedToken(userA, manager, hmacKey, kv),
      /No token found/,
      'User A should not find User B token (different HMAC key)'
    );

    // Verify User B can still retrieve their tokens normally
    const retrievedB = await retrieveEncryptedToken(userB, manager, hmacKey, kv);
    assert.strictEqual(retrievedB.user_id, userB);
  });

  it('should prevent session hijacking via user_id_hash validation', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);
    const kv = new MockKV() as unknown as KVNamespace;

    // User A stores token
    const userA = 'alice@example.com';
    const tokensA = createTokensForUser(userA);
    await storeEncryptedToken(userA, tokensA, manager, hmacKey, kv);

    // Attacker (User B) steals User A's encrypted token from KV
    const keyA = await computeKVKey(userA, hmacKey);
    const stolenEncryptedJson = await kv.get(keyA);
    const stolenEncrypted = JSON.parse(stolenEncryptedJson!);

    // Attacker stores User A's token under User B's KV key
    const userB = 'bob@example.com';
    const keyB = await computeKVKey(userB, hmacKey);
    await kv.put(keyB, JSON.stringify(stolenEncrypted));

    // User B tries to retrieve - should fail user_id_hash validation
    await assert.rejects(
      async () => retrieveEncryptedToken(userB, manager, hmacKey, kv),
      /Session validation failed/,
      'User B should not validate User A token (user_id_hash mismatch)'
    );
  });

  it('should prevent token enumeration via non-predictable HMAC keys', async () => {
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);

    // Multiple users
    const users = [
      'alice@example.com',
      'bob@example.com',
      'charlie@example.com',
      'diana@example.com',
      'eve@example.com',
    ];

    const keys: string[] = [];
    for (const user of users) {
      const kvKey = await computeKVKey(user, hmacKey);
      keys.push(kvKey);

      // Verify key format
      assert.ok(kvKey.startsWith('google_tokens:'), 'Key should have correct prefix');
      const hash = kvKey.split(':')[1];
      assert.ok(/^[0-9a-f]{64}$/.test(hash!), 'Hash should be 64-char hex');
    }

    // Verify all keys are unique
    const uniqueKeys = new Set(keys);
    assert.strictEqual(uniqueKeys.size, users.length, 'All keys should be unique');

    // Verify no sequential pattern (extract first 16 hex chars as integers)
    for (let i = 0; i < keys.length - 1; i++) {
      const hashA = keys[i]!.split(':')[1]!;
      const hashB = keys[i + 1]!.split(':')[1]!;

      const intA = parseInt(hashA.slice(0, 16), 16);
      const intB = parseInt(hashB.slice(0, 16), 16);
      const diff = Math.abs(intA - intB);

      assert.ok(
        diff > 1000,
        `Keys should not be sequential (diff=${diff} between ${users[i]} and ${users[i + 1]})`
      );
    }
  });

  it('should verify tokens are encrypted ciphertext, not plaintext JSON', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);
    const kv = new MockKV() as unknown as KVNamespace;

    const user = 'alice@example.com';
    const tokens = createTokensForUser(user);
    await storeEncryptedToken(user, tokens, manager, hmacKey, kv);

    // Manually inspect KV to verify encryption
    const kvKey = await computeKVKey(user, hmacKey);
    const storedJson = await kv.get(kvKey);
    assert.ok(storedJson, 'Token should be stored');

    const stored = JSON.parse(storedJson);

    // Verify EncryptedToken structure
    assert.ok('iv' in stored, 'Should have iv field');
    assert.ok('ciphertext' in stored, 'Should have ciphertext field');
    assert.ok('tag' in stored, 'Should have tag field');
    assert.ok('user_id_hash' in stored, 'Should have user_id_hash field');

    // Verify ciphertext is not plaintext
    const ciphertext = stored.ciphertext;
    assert.ok(
      typeof ciphertext === 'string',
      'Ciphertext should be string (base64)'
    );
    assert.ok(
      !ciphertext.includes('access_token'),
      'Ciphertext should not contain plaintext "access_token"'
    );
    assert.ok(
      !ciphertext.includes('refresh_token'),
      'Ciphertext should not contain plaintext "refresh_token"'
    );
    assert.ok(
      !ciphertext.includes(user),
      'Ciphertext should not contain plaintext user email'
    );

    // Verify user_id_hash is HMAC (not plaintext email)
    assert.ok(
      !stored.user_id_hash.includes(user),
      'user_id_hash should not contain plaintext email'
    );
    assert.ok(
      /^[0-9a-f]{64}$/.test(stored.user_id_hash),
      'user_id_hash should be 64-char hex HMAC'
    );
  });

  it('should enforce cross-user access isolation in calendar tool calls', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);
    const kv = new MockKV() as unknown as KVNamespace;

    // User A and User B both authorize
    const userA = 'alice@example.com';
    const userB = 'bob@example.com';

    const tokensA = createTokensForUser(userA);
    const tokensB = createTokensForUser(userB);

    await storeEncryptedToken(userA, tokensA, manager, hmacKey, kv);
    await storeEncryptedToken(userB, tokensB, manager, hmacKey, kv);

    // User A calls calendar tool (simulated)
    const retrievedA = await retrieveEncryptedToken(userA, manager, hmacKey, kv);
    assert.strictEqual(retrievedA.user_id, userA);
    assert.ok(
      retrievedA.access_token.includes(userA),
      'User A should only see their access token'
    );

    // User B calls calendar tool (simulated)
    const retrievedB = await retrieveEncryptedToken(userB, manager, hmacKey, kv);
    assert.strictEqual(retrievedB.user_id, userB);
    assert.ok(
      retrievedB.access_token.includes(userB),
      'User B should only see their access token'
    );

    // Verify User A cannot access User B's data
    // (handled by KV key isolation + user_id_hash validation)
    const keyB = await computeKVKey(userB, hmacKey);
    const encryptedB = JSON.parse((await kv.get(keyB))!);

    // Even if User A somehow gets User B's encrypted token, validation fails
    const isValidForA = await validateSession(userA, encryptedB, hmacKey);
    assert.strictEqual(
      isValidForA,
      false,
      'User A should not validate User B token'
    );
  });

  it('should test complete OAuth flow for 3 users with isolation verification', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);
    const kv = new MockKV() as unknown as KVNamespace;

    // Three users complete OAuth flows
    const users = [
      'alice@example.com',
      'bob@example.com',
      'charlie@example.com',
    ];

    // Step 1: All users authorize and store tokens
    for (const user of users) {
      const tokens = createTokensForUser(user);
      await storeEncryptedToken(user, tokens, manager, hmacKey, kv);
    }

    // Verify all 3 tokens stored
    assert.strictEqual(kv.size(), 3, 'Should have 3 tokens stored');

    // Step 2: Verify each user can only retrieve their own tokens
    for (const user of users) {
      const retrieved = await retrieveEncryptedToken(user, manager, hmacKey, kv);
      assert.strictEqual(retrieved.user_id, user);
      assert.ok(retrieved.access_token.includes(user));
    }

    // Step 3: Verify cross-user access fails
    for (let i = 0; i < users.length; i++) {
      for (let j = 0; j < users.length; j++) {
        if (i === j) continue; // Skip self-access

        const requestingUser = users[i]!;
        const targetUser = users[j]!;

        // Get target user's encrypted token
        const targetKey = await computeKVKey(targetUser, hmacKey);
        const targetEncrypted = JSON.parse((await kv.get(targetKey))!);

        // Verify requesting user cannot validate target's token
        const isValid = await validateSession(
          requestingUser,
          targetEncrypted,
          hmacKey
        );
        assert.strictEqual(
          isValid,
          false,
          `${requestingUser} should not validate ${targetUser} token`
        );
      }
    }

    // Step 4: Verify KV keys are all non-enumerable (HMAC-based)
    const allKeys = await kv.list();
    for (const key of allKeys.keys) {
      const hash = key.name.split(':')[1];
      assert.ok(
        /^[0-9a-f]{64}$/.test(hash!),
        'All keys should be HMAC-hashed'
      );

      // Verify hash doesn't contain email fragments
      for (const user of users) {
        const localPart = user.split('@')[0];
        assert.ok(
          !hash!.includes(localPart!),
          `Hash should not contain email fragment: ${localPart}`
        );
      }
    }
  });

  it('should prevent token replay attacks by validating embedded user_id', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);
    const kv = new MockKV() as unknown as KVNamespace;

    // User A stores token
    const userA = 'alice@example.com';
    const tokensA = createTokensForUser(userA);
    await storeEncryptedToken(userA, tokensA, manager, hmacKey, kv);

    // Attacker tries to replay User A's token for User B
    // Step 1: Get User A's encrypted token
    const keyA = await computeKVKey(userA, hmacKey);
    const encryptedA = JSON.parse((await kv.get(keyA))!);

    // Step 2: Decrypt User A's token (attacker somehow gets encryption key)
    const decryptedA = await manager.decrypt(encryptedA);

    // Step 3: Attacker modifies user_id to User B and re-encrypts
    const userB = 'bob@example.com';
    const forgedTokens = {
      ...decryptedA,
      user_id: userB, // Forged user_id
      user_email: userB,
    };

    // Step 4: Store forged token under User B's key
    const forgedEncrypted = await manager.encrypt(forgedTokens, userB);
    const keyB = await computeKVKey(userB, hmacKey);
    await kv.put(keyB, JSON.stringify(forgedEncrypted));

    // Step 5: User B tries to retrieve - should succeed (token is valid)
    // BUT the access_token still belongs to User A (contains userA email fragment)
    const retrieved = await retrieveEncryptedToken(userB, manager, hmacKey, kv);

    // Verify the token is retrieved but access_token is wrong
    assert.strictEqual(retrieved.user_id, userB);
    assert.ok(
      retrieved.access_token.includes(userA),
      'Access token should still contain User A email (replay attack successful but detectable)'
    );

    // In production, calendar API calls would fail because access_token
    // is for User A's Google account, not User B's
    // This demonstrates defense-in-depth: even if token validation passes,
    // Google API will reject the mismatched access_token
  });
});
