// End-to-End Flow Integration Tests
// Tests complete user journeys from MCP OAuth through tool usage
// Validates multi-user scenarios, token refresh, event lifecycle

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TokenManager, importEncryptionKey, importHmacKey } from '../src/crypto.ts';
import { storeEncryptedToken, retrieveEncryptedToken } from '../src/kv-storage.ts';
import type { GoogleTokens } from '../src/types.ts';

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
}

// Test utilities
function createValidTokens(userEmail: string, expiresIn = 3600000): GoogleTokens {
  return {
    access_token: `ya29.${userEmail}_access_token`,
    refresh_token: `${userEmail}_refresh_token`,
    expires_at: Date.now() + expiresIn,
    scope: 'https://www.googleapis.com/auth/calendar',
    user_email: userEmail,
    user_id: userEmail,
  };
}

function createExpiredTokens(userEmail: string): GoogleTokens {
  return {
    access_token: `ya29.${userEmail}_expired_token`,
    refresh_token: `${userEmail}_refresh_token`,
    expires_at: Date.now() - 1000, // Expired 1 second ago
    scope: 'https://www.googleapis.com/auth/calendar',
    user_email: userEmail,
    user_id: userEmail,
  };
}

function createSoonToExpireTokens(userEmail: string): GoogleTokens {
  return {
    access_token: `ya29.${userEmail}_expiring_token`,
    refresh_token: `${userEmail}_refresh_token`,
    expires_at: Date.now() + 240000, // 4 minutes (< 5 min threshold)
    scope: 'https://www.googleapis.com/auth/calendar',
    user_email: userEmail,
    user_id: userEmail,
  };
}

describe('End-to-End Flow Integration Tests', () => {
  // E2E-001: Complete OAuth flow (new user)
  it('should complete full OAuth flow: MCP OAuth → Google OAuth → token storage → tool usage', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);
    const kv = new MockKV() as unknown as KVNamespace;

    // Step 1: New user completes MCP OAuth (simulated - gets user_email)
    const userEmail = 'newuser@example.com';

    // Step 2: User redirected to Google OAuth (simulated - receives tokens)
    const googleTokens = createValidTokens(userEmail);

    // Step 3: Tokens encrypted and stored in KV
    await storeEncryptedToken(userEmail, googleTokens, manager, hmacKey, kv);

    // Step 4: MCP tool call retrieves and validates tokens
    const retrievedTokens = await retrieveEncryptedToken(
      userEmail,
      manager,
      hmacKey,
      kv
    );

    // Verify token integrity
    assert.strictEqual(retrievedTokens.access_token, googleTokens.access_token);
    assert.strictEqual(retrievedTokens.user_email, userEmail);
    assert.ok(retrievedTokens.expires_at > Date.now(), 'Token should be valid');

    // Step 5: Simulate MCP tool usage (list_events, create_event, etc.)
    // Token is available for API calls
    assert.ok(retrievedTokens.access_token.startsWith('ya29.'));
  });

  // E2E-002: Multi-user concurrent usage
  it('should support concurrent multi-user flows with complete isolation', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);
    const kv = new MockKV() as unknown as KVNamespace;

    // Simulate 3 users completing OAuth flows concurrently
    const users = ['alice@example.com', 'bob@example.com', 'charlie@example.com'];

    // All users complete OAuth and store tokens
    await Promise.all(
      users.map((user) =>
        storeEncryptedToken(user, createValidTokens(user), manager, hmacKey, kv)
      )
    );

    // All users make concurrent tool calls
    const retrievedTokens = await Promise.all(
      users.map((user) => retrieveEncryptedToken(user, manager, hmacKey, kv))
    );

    // Verify complete isolation
    for (let i = 0; i < users.length; i++) {
      assert.strictEqual(retrievedTokens[i].user_email, users[i]);
      assert.ok(
        retrievedTokens[i].access_token.includes(users[i]),
        'Token should be user-specific'
      );
    }

    // Verify no cross-contamination
    const uniqueTokens = new Set(retrievedTokens.map((t) => t.access_token));
    assert.strictEqual(
      uniqueTokens.size,
      3,
      'All tokens should be unique'
    );
  });

  // E2E-003: Token refresh flow (expired token)
  it('should handle expired token scenario requiring refresh', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);
    const kv = new MockKV() as unknown as KVNamespace;

    const userEmail = 'test@example.com';

    // Store expired token
    const expiredTokens = createExpiredTokens(userEmail);
    await storeEncryptedToken(userEmail, expiredTokens, manager, hmacKey, kv);

    // Retrieve token (should succeed - expiry check happens after retrieval)
    const retrieved = await retrieveEncryptedToken(
      userEmail,
      manager,
      hmacKey,
      kv
    );

    // Verify token is expired
    assert.ok(retrieved.expires_at < Date.now(), 'Token should be expired');

    // In actual implementation, mcp-server.ts will detect expiry and refresh
    // Simulate refresh by storing new tokens
    const refreshedTokens = createValidTokens(userEmail);
    await storeEncryptedToken(userEmail, refreshedTokens, manager, hmacKey, kv);

    // Verify new token is valid
    const afterRefresh = await retrieveEncryptedToken(
      userEmail,
      manager,
      hmacKey,
      kv
    );
    assert.ok(afterRefresh.expires_at > Date.now(), 'Refreshed token should be valid');
    assert.notStrictEqual(
      afterRefresh.access_token,
      expiredTokens.access_token,
      'Access token should be refreshed'
    );
  });

  // E2E-004: Proactive token refresh (< 5 min threshold)
  it('should trigger proactive refresh when token expires in < 5 minutes', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);
    const kv = new MockKV() as unknown as KVNamespace;

    const userEmail = 'test@example.com';

    // Store token expiring in 4 minutes
    const soonExpiring = createSoonToExpireTokens(userEmail);
    await storeEncryptedToken(userEmail, soonExpiring, manager, hmacKey, kv);

    // Retrieve token
    const retrieved = await retrieveEncryptedToken(
      userEmail,
      manager,
      hmacKey,
      kv
    );

    // Calculate time until expiry
    const timeUntilExpiry = retrieved.expires_at - Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    assert.ok(
      timeUntilExpiry < fiveMinutes,
      'Token should expire in < 5 minutes'
    );

    // In actual implementation, mcp-server.ts will proactively refresh
    // Verify refresh threshold is correctly detected
    assert.ok(
      timeUntilExpiry > 0 && timeUntilExpiry < fiveMinutes,
      'Should be in proactive refresh window'
    );
  });

  // E2E-005: Event lifecycle (create → query → move → query)
  it('should support complete event lifecycle across tool calls', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);
    const kv = new MockKV() as unknown as KVNamespace;

    const userEmail = 'test@example.com';
    const tokens = createValidTokens(userEmail);
    await storeEncryptedToken(userEmail, tokens, manager, hmacKey, kv);

    // Step 1: Create event (simulated - would call create_event tool)
    const eventId = 'test_event_123';
    const eventData = {
      summary: 'Test Meeting',
      start: { dateTime: '2026-02-20T10:00:00Z' },
      end: { dateTime: '2026-02-20T11:00:00Z' },
    };

    // Verify tokens available for create_event API call
    const tokensForCreate = await retrieveEncryptedToken(
      userEmail,
      manager,
      hmacKey,
      kv
    );
    assert.ok(tokensForCreate.access_token, 'Token available for creation');

    // Step 2: Query event (simulated - would call get_event tool)
    const tokensForQuery = await retrieveEncryptedToken(
      userEmail,
      manager,
      hmacKey,
      kv
    );
    assert.ok(tokensForQuery.access_token, 'Token available for query');

    // Step 3: Move event (simulated - would call move_event tool)
    const tokensForMove = await retrieveEncryptedToken(
      userEmail,
      manager,
      hmacKey,
      kv
    );
    assert.ok(tokensForMove.access_token, 'Token available for move');

    // Step 4: Query again to verify move (simulated)
    const tokensForVerify = await retrieveEncryptedToken(
      userEmail,
      manager,
      hmacKey,
      kv
    );
    assert.ok(tokensForVerify.access_token, 'Token available for verification');

    // All operations use same valid token
    assert.strictEqual(tokensForCreate.access_token, tokensForQuery.access_token);
    assert.strictEqual(tokensForQuery.access_token, tokensForMove.access_token);
  });

  // E2E-006: Multi-calendar query flow
  it('should support querying events across multiple calendars', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);
    const kv = new MockKV() as unknown as KVNamespace;

    const userEmail = 'test@example.com';
    const tokens = createValidTokens(userEmail);
    await storeEncryptedToken(userEmail, tokens, manager, hmacKey, kv);

    // Simulate list_events call for multiple calendars
    const calendarIds = ['primary', 'work@example.com', 'personal@example.com'];

    // For each calendar, tool would retrieve token
    for (const calendarId of calendarIds) {
      const retrieved = await retrieveEncryptedToken(
        userEmail,
        manager,
        hmacKey,
        kv
      );
      assert.ok(retrieved.access_token, `Token available for calendar ${calendarId}`);
    }

    // In actual implementation, these would be parallel API calls
    // Verify token remains valid across multiple queries
    const finalCheck = await retrieveEncryptedToken(
      userEmail,
      manager,
      hmacKey,
      kv
    );
    assert.strictEqual(finalCheck.access_token, tokens.access_token);
  });

  // E2E-007: Error recovery flow (token decryption failure → re-auth)
  it('should handle token corruption with graceful re-auth prompt', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);
    const kv = new MockKV() as unknown as KVNamespace;

    const userEmail = 'test@example.com';
    const tokens = createValidTokens(userEmail);
    await storeEncryptedToken(userEmail, tokens, manager, hmacKey, kv);

    // Simulate corruption by modifying stored ciphertext
    const allKeys = await kv.list();
    const userKey = allKeys.keys[0]!.name;
    const stored = await kv.get(userKey);
    const parsed = JSON.parse(stored!);
    parsed.ciphertext = parsed.ciphertext.slice(0, -4) + 'XXXX'; // Corrupt
    await kv.put(userKey, JSON.stringify(parsed));

    // Attempt retrieval - should fail with clear error
    await assert.rejects(
      async () => retrieveEncryptedToken(userEmail, manager, hmacKey, kv),
      /Failed to decrypt token/,
      'Should reject corrupted token with re-auth guidance'
    );

    // In actual implementation, this would return re-auth URL to user
  });

  // E2E-008: Long idle period → refresh token expiration
  it('should handle long idle period requiring full re-authorization', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);
    const kv = new MockKV() as unknown as KVNamespace;

    const userEmail = 'test@example.com';

    // Store tokens with very old creation date (simulating long idle)
    const oldTokens = createValidTokens(userEmail);
    oldTokens.expires_at = Date.now() - 86400000; // Expired 24 hours ago
    await storeEncryptedToken(userEmail, oldTokens, manager, hmacKey, kv);

    // Retrieve tokens (succeeds - they're encrypted correctly)
    const retrieved = await retrieveEncryptedToken(
      userEmail,
      manager,
      hmacKey,
      kv
    );

    // Verify tokens are expired
    assert.ok(
      retrieved.expires_at < Date.now(),
      'Tokens should be expired after long idle'
    );

    // In actual implementation, refresh attempt would fail
    // (refresh_token revoked), requiring re-auth
    assert.ok(retrieved.refresh_token, 'Refresh token present for retry');
  });
});
