// Session validation utilities
// Implements HMAC-based KV key generation and user identity verification

import type { EncryptedToken } from './types';

/**
 * Compute KV key for storing encrypted tokens
 * Uses HMAC-SHA256 to create non-enumerable, non-reversible keys
 * @param userEmail User's email address (MCP user identity)
 * @param hmacKey HMAC key for computing hash
 * @returns KV key in format "google_tokens:{64-char-hex-hash}"
 */
export async function computeKVKey(
  userEmail: string,
  hmacKey: CryptoKey
): Promise<string> {
  const signature = await crypto.subtle.sign(
    'HMAC',
    hmacKey,
    new TextEncoder().encode(userEmail)
  );

  const hex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `google_tokens:${hex}`;
}

/**
 * Validate that the requesting user owns the encrypted token
 * Compares HMAC(requestingUserId) with encryptedToken.user_id_hash
 * Logs security events for audit trail
 * @param requestingUserId User ID from MCP session (email)
 * @param encryptedToken Encrypted token from KV storage
 * @param hmacKey HMAC key for computing expected hash
 * @returns true if validation succeeds, false otherwise
 */
export async function validateSession(
  requestingUserId: string,
  encryptedToken: EncryptedToken,
  hmacKey: CryptoKey
): Promise<boolean> {
  // Compute expected user_id_hash
  const signature = await crypto.subtle.sign(
    'HMAC',
    hmacKey,
    new TextEncoder().encode(requestingUserId)
  );

  const expectedHash = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Compare hashes (constant-time comparison not required for HMAC output)
  if (encryptedToken.user_id_hash !== expectedHash) {
    console.warn(
      `[SECURITY] Session validation failed: user_id_hash mismatch for user=${requestingUserId}`
    );
    return false;
  }

  console.log(
    `[SECURITY] Session validation succeeded for user=${requestingUserId}`
  );
  return true;
}
