// KV storage utilities - Glue layer between TokenManager and KV
// Provides high-level functions for storing and retrieving encrypted tokens

import type { GoogleTokens, EncryptedToken } from './types';
import { TokenManager } from './crypto.ts';
import { computeKVKey, validateSession } from './session.ts';
import { AuditLogger } from './audit.ts';

/**
 * Store encrypted Google OAuth tokens in KV
 * @param userEmail User's email address (MCP user identity)
 * @param tokens GoogleTokens to encrypt and store
 * @param tokenManager TokenManager instance for encryption
 * @param hmacKey HMAC key for computing KV key
 * @param kv KVNamespace for storage
 * @param auditLogger Optional AuditLogger for security events
 */
export async function storeEncryptedToken(
  userEmail: string,
  tokens: GoogleTokens,
  tokenManager: TokenManager,
  hmacKey: CryptoKey,
  kv: KVNamespace,
  auditLogger?: AuditLogger
): Promise<void> {
  // Encrypt tokens
  const encryptedToken = await tokenManager.encrypt(tokens, userEmail);

  // Compute KV key
  const kvKey = await computeKVKey(userEmail, hmacKey);

  // Store in KV
  await kv.put(kvKey, JSON.stringify(encryptedToken));

  // Log storage event
  if (auditLogger) {
    auditLogger.logTokenAccess(userEmail, 'store_encrypted_token');
  }
}

/**
 * Retrieve and validate encrypted Google OAuth tokens from KV
 * @param userEmail User's email address (MCP user identity)
 * @param tokenManager TokenManager instance for decryption
 * @param hmacKey HMAC key for computing KV key and validation
 * @param kv KVNamespace for retrieval
 * @param auditLogger Optional AuditLogger for security events
 * @returns Decrypted GoogleTokens
 * @throws Error if token not found, validation fails, or decryption fails
 */
export async function retrieveEncryptedToken(
  userEmail: string,
  tokenManager: TokenManager,
  hmacKey: CryptoKey,
  kv: KVNamespace,
  auditLogger?: AuditLogger
): Promise<GoogleTokens> {
  // Compute KV key (Layer 1: HMAC-based key prevents enumeration)
  const kvKey = await computeKVKey(userEmail, hmacKey);

  // Fetch encrypted token from KV
  const encryptedJson = await kv.get(kvKey);

  if (!encryptedJson) {
    if (auditLogger) {
      auditLogger.logSecurityViolation(userEmail, 'Token not found in KV');
    }
    throw new Error(
      `No token found for user ${userEmail}. Please authorize first.`
    );
  }

  // Parse encrypted token
  let encryptedToken: EncryptedToken;
  try {
    encryptedToken = JSON.parse(encryptedJson);
  } catch (error) {
    if (auditLogger) {
      auditLogger.logSecurityViolation(userEmail, 'Malformed encrypted token JSON');
    }
    throw new Error(
      `Token data is malformed for user ${userEmail}. Please re-authorize.`
    );
  }

  // Validate session (Layer 2: user_id_hash validation after KV fetch)
  const isValid = await validateSession(
    userEmail,
    encryptedToken,
    hmacKey,
    auditLogger
  );

  if (!isValid) {
    if (auditLogger) {
      auditLogger.logSecurityViolation(
        userEmail,
        'Session validation failed (user_id_hash mismatch)'
      );
    }
    throw new Error(
      `Session validation failed for user ${userEmail}. Token may have been tampered with.`
    );
  }

  // Decrypt tokens
  let tokens: GoogleTokens;
  try {
    tokens = await tokenManager.decrypt(encryptedToken);
  } catch (error) {
    if (auditLogger) {
      auditLogger.logSecurityViolation(
        userEmail,
        'Token decryption failed',
        {
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      );
    }
    throw new Error(
      `Failed to decrypt token for user ${userEmail}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  // Layer 3: Validate embedded user_id matches requesting user
  if (tokens.user_id !== userEmail) {
    if (auditLogger) {
      auditLogger.logSecurityViolation(
        userEmail,
        'Token ownership validation failed',
        {
          expected_user: userEmail,
          token_user: tokens.user_id,
        }
      );
    }
    throw new Error(
      `Token ownership validation failed for user ${userEmail}. This token belongs to a different user.`
    );
  }

  // Log successful retrieval
  if (auditLogger) {
    auditLogger.logTokenAccess(userEmail, 'retrieve_encrypted_token');
  }

  return tokens;
}
