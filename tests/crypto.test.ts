// Unit tests for TokenManager (crypto.ts)
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TokenManager, importEncryptionKey, importHmacKey } from '../src/crypto.ts';
import type { GoogleTokens } from '../src/types.ts';

// Test keys (hex-encoded 32 bytes)
const TEST_ENCRYPTION_KEY =
  'a3271085b886512025e9fcd71336ac4393ddb400848b8197b53ae0dadc6eb9b4';
const TEST_HMAC_KEY =
  '9b0ea7b56b8ca68821c96e032c55dab2cc58206d63226cf3519b92f4784f38f9';

describe('TokenManager', () => {
  it('should encrypt and decrypt tokens successfully (round-trip)', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);

    const testTokens: GoogleTokens = {
      access_token: 'ya29.test_access_token',
      refresh_token: 'test_refresh_token',
      expires_at: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/calendar',
      user_email: 'test@example.com',
      user_id: 'test@example.com',
    };

    const userId = 'test@example.com';

    // Encrypt
    const encrypted = await manager.encrypt(testTokens, userId);

    // Verify encrypted structure
    assert.ok(encrypted.iv, 'IV should be present');
    assert.ok(encrypted.ciphertext, 'Ciphertext should be present');
    assert.ok(encrypted.user_id_hash, 'user_id_hash should be present');
    assert.strictEqual(encrypted.user_id_hash.length, 64, 'user_id_hash should be 64 chars');
    assert.ok(encrypted.created_at > 0, 'created_at should be set');
    assert.strictEqual(
      encrypted.expires_at,
      testTokens.expires_at,
      'expires_at should match input'
    );

    // Decrypt
    const decrypted = await manager.decrypt(encrypted);

    // Verify decrypted matches original
    assert.strictEqual(decrypted.access_token, testTokens.access_token);
    assert.strictEqual(decrypted.refresh_token, testTokens.refresh_token);
    assert.strictEqual(decrypted.expires_at, testTokens.expires_at);
    assert.strictEqual(decrypted.scope, testTokens.scope);
    assert.strictEqual(decrypted.user_email, testTokens.user_email);
    assert.strictEqual(decrypted.user_id, testTokens.user_id);
  });

  it('should generate unique IVs for each encryption', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);

    const testTokens: GoogleTokens = {
      access_token: 'ya29.test_access_token',
      refresh_token: 'test_refresh_token',
      expires_at: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/calendar',
      user_email: 'test@example.com',
      user_id: 'test@example.com',
    };

    // Encrypt same tokens multiple times
    const encrypted1 = await manager.encrypt(testTokens, 'test@example.com');
    const encrypted2 = await manager.encrypt(testTokens, 'test@example.com');
    const encrypted3 = await manager.encrypt(testTokens, 'test@example.com');

    // IVs should all be unique
    assert.notStrictEqual(encrypted1.iv, encrypted2.iv, 'IV 1 and 2 should differ');
    assert.notStrictEqual(encrypted2.iv, encrypted3.iv, 'IV 2 and 3 should differ');
    assert.notStrictEqual(encrypted1.iv, encrypted3.iv, 'IV 1 and 3 should differ');

    // Ciphertexts should also differ (due to unique IVs)
    assert.notStrictEqual(
      encrypted1.ciphertext,
      encrypted2.ciphertext,
      'Ciphertext should differ'
    );
  });

  it('should throw error when decrypting tampered ciphertext', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);

    const testTokens: GoogleTokens = {
      access_token: 'ya29.test_access_token',
      refresh_token: 'test_refresh_token',
      expires_at: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/calendar',
      user_email: 'test@example.com',
      user_id: 'test@example.com',
    };

    const encrypted = await manager.encrypt(testTokens, 'test@example.com');

    // Tamper with ciphertext
    const tampered = {
      ...encrypted,
      ciphertext: encrypted.ciphertext.slice(0, -4) + 'XXXX',
    };

    // Should throw due to authentication failure
    await assert.rejects(
      async () => manager.decrypt(tampered),
      /Token decryption failed/,
      'Should reject tampered ciphertext'
    );
  });

  it('should generate deterministic user_id_hash for same userId', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);

    const testTokens: GoogleTokens = {
      access_token: 'ya29.test_access_token',
      refresh_token: 'test_refresh_token',
      expires_at: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/calendar',
      user_email: 'test@example.com',
      user_id: 'test@example.com',
    };

    const encrypted1 = await manager.encrypt(testTokens, 'test@example.com');
    const encrypted2 = await manager.encrypt(testTokens, 'test@example.com');

    // user_id_hash should be deterministic (same for same userId)
    assert.strictEqual(
      encrypted1.user_id_hash,
      encrypted2.user_id_hash,
      'user_id_hash should be deterministic'
    );
  });

  it('should generate different user_id_hash for different userIds', async () => {
    const encryptionKey = await importEncryptionKey(TEST_ENCRYPTION_KEY);
    const hmacKey = await importHmacKey(TEST_HMAC_KEY);
    const manager = new TokenManager(encryptionKey, hmacKey);

    const testTokens1: GoogleTokens = {
      access_token: 'ya29.test_access_token',
      refresh_token: 'test_refresh_token',
      expires_at: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/calendar',
      user_email: 'user1@example.com',
      user_id: 'user1@example.com',
    };

    const testTokens2: GoogleTokens = {
      ...testTokens1,
      user_email: 'user2@example.com',
      user_id: 'user2@example.com',
    };

    const encrypted1 = await manager.encrypt(testTokens1, 'user1@example.com');
    const encrypted2 = await manager.encrypt(testTokens2, 'user2@example.com');

    // user_id_hash should differ for different users
    assert.notStrictEqual(
      encrypted1.user_id_hash,
      encrypted2.user_id_hash,
      'user_id_hash should differ for different users'
    );
  });
});
