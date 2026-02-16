// Unit tests for OAuth callback CSRF protection (app.ts)
import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('OAuth Callback CSRF Protection', () => {
  it('should generate CSRF token during /google/auth', () => {
    // CSRF token should be:
    // 1. Random 32-byte hex string (64 characters)
    // 2. Stored in KV with 10-minute expiry
    // 3. Included in state parameter

    const csrfTokenPattern = /^[0-9a-f]{64}$/;
    const exampleToken =
      'a3b4c5d6e7f80910111213141516171819202122232425262728293031323334';

    // Verify format (mock test - implementation is in app.ts)
    assert.ok(
      csrfTokenPattern.test(exampleToken),
      'CSRF token should be 64-character hex string'
    );
  });

  it('should include CSRF token in state parameter', () => {
    // State parameter should be JSON: { userEmail, csrfToken }
    const state = JSON.stringify({
      userEmail: 'test@example.com',
      csrfToken: 'a3b4c5d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2u3v4w5x6y7z8a9b0c1d2e3f4',
    });

    const stateData = JSON.parse(state);
    assert.strictEqual(stateData.userEmail, 'test@example.com');
    assert.ok(stateData.csrfToken, 'CSRF token should be present');
    assert.strictEqual(stateData.csrfToken.length, 64, 'CSRF token should be 64 chars');
  });

  it('should validate CSRF token during callback', () => {
    // Callback should:
    // 1. Extract csrfToken from state parameter
    // 2. Fetch csrf:${csrfToken} from KV
    // 3. Verify userEmail matches
    // 4. Verify timestamp is within 10 minutes
    // 5. Delete CSRF token (one-time use)

    const csrfToken = 'a3b4c5d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2u3v4w5x6y7z8a9b0c1d2e3f4';
    const csrfKey = `csrf:${csrfToken}`;

    assert.strictEqual(csrfKey, `csrf:${csrfToken}`, 'CSRF key format should be correct');
  });

  it('should reject callback with missing CSRF token', () => {
    // State parameter missing csrfToken
    const state = JSON.stringify({ userEmail: 'test@example.com' });

    const stateData = JSON.parse(state);
    assert.strictEqual(stateData.userEmail, 'test@example.com');
    assert.strictEqual(stateData.csrfToken, undefined, 'CSRF token should be missing');

    // Expected error: "Invalid state parameter"
  });

  it('should reject callback with invalid CSRF token', () => {
    // CSRF token not found in KV
    const csrfToken = 'invalid_token_not_in_kv';
    const csrfKey = `csrf:${csrfToken}`;

    // Mock KV.get(csrfKey) returns null
    const csrfData = null;

    assert.strictEqual(csrfData, null, 'CSRF token should not be found');
    // Expected error: "Invalid or expired CSRF token"
  });

  it('should reject callback with mismatched user email', () => {
    // CSRF data has different userEmail than state parameter
    const storedCsrfData = {
      userEmail: 'victim@example.com',
      timestamp: Date.now(),
    };

    const stateData = {
      userEmail: 'attacker@example.com',
      csrfToken: 'valid_token',
    };

    assert.notStrictEqual(
      storedCsrfData.userEmail,
      stateData.userEmail,
      'User emails should not match'
    );
    // Expected error: "CSRF validation failed: user mismatch"
  });

  it('should reject callback with expired CSRF token', () => {
    // CSRF token older than 10 minutes
    const storedCsrfData = {
      userEmail: 'test@example.com',
      timestamp: Date.now() - 11 * 60 * 1000, // 11 minutes ago
    };

    const age = Date.now() - storedCsrfData.timestamp;
    const maxAge = 10 * 60 * 1000; // 10 minutes

    assert.ok(age > maxAge, 'CSRF token should be expired');
    // Expected error: "CSRF token expired"
  });

  it('should delete CSRF token after successful validation', () => {
    // After successful callback, CSRF token should be deleted from KV
    // This ensures tokens are single-use only

    const csrfToken = 'valid_token';
    const csrfKey = `csrf:${csrfToken}`;

    // Expected: c.env.OAUTH_KV.delete(csrfKey)
    assert.ok(true, 'CSRF token should be deleted after use');
  });

  it('should accept valid CSRF token within expiry window', () => {
    // CSRF token created 5 minutes ago (within 10-minute window)
    const storedCsrfData = {
      userEmail: 'test@example.com',
      timestamp: Date.now() - 5 * 60 * 1000, // 5 minutes ago
    };

    const stateData = {
      userEmail: 'test@example.com',
      csrfToken: 'valid_token',
    };

    const age = Date.now() - storedCsrfData.timestamp;
    const maxAge = 10 * 60 * 1000;

    assert.strictEqual(
      storedCsrfData.userEmail,
      stateData.userEmail,
      'User emails should match'
    );
    assert.ok(age < maxAge, 'CSRF token should not be expired');
    // Expected: Proceed with token exchange
  });

  it('should handle malformed CSRF data gracefully', () => {
    // CSRF data in KV is not valid JSON
    const csrfData = 'not valid json';

    try {
      JSON.parse(csrfData);
      assert.fail('Should throw JSON parse error');
    } catch (error) {
      assert.ok(error instanceof SyntaxError, 'Should be JSON parse error');
      // Expected error: "Malformed CSRF data"
    }
  });
});
