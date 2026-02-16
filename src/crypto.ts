// Token encryption/decryption (TokenManager class)
// Implements AES-256-GCM encryption using Web Crypto API

import type { EncryptedToken, GoogleTokens } from './types';

/**
 * Utility functions for base64 encoding/decoding
 */
function base64Encode(data: Uint8Array): string {
  const binString = Array.from(data, (byte) => String.fromCodePoint(byte)).join('');
  return btoa(binString);
}

function base64Decode(base64: string): Uint8Array {
  const binString = atob(base64);
  return Uint8Array.from(binString, (char) => char.codePointAt(0)!);
}

/**
 * TokenManager - Encrypts and decrypts Google OAuth tokens
 * Uses AES-256-GCM for authenticated encryption with unique IV per operation
 */
export class TokenManager {
  private encryptionKey: CryptoKey;
  private hmacKey: CryptoKey;

  constructor(encryptionKey: CryptoKey, hmacKey: CryptoKey) {
    this.encryptionKey = encryptionKey;
    this.hmacKey = hmacKey;
  }

  /**
   * Encrypt GoogleTokens with AES-256-GCM
   * Generates random 12-byte IV, computes user_id_hash via HMAC-SHA256
   */
  async encrypt(tokens: GoogleTokens, userId: string): Promise<EncryptedToken> {
    // Generate random IV (12 bytes for GCM)
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Serialize tokens to JSON
    const payload = new TextEncoder().encode(JSON.stringify(tokens));

    // Encrypt with AES-256-GCM (includes authentication tag automatically)
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      this.encryptionKey,
      payload
    );

    // Compute user_id_hash for session validation
    const userIdHash = await this.computeUserIdHash(userId);

    return {
      iv: base64Encode(iv),
      ciphertext: base64Encode(new Uint8Array(ciphertext)),
      tag: '', // GCM tag is included in ciphertext by SubtleCrypto
      user_id_hash: userIdHash,
      created_at: Date.now(),
      expires_at: tokens.expires_at,
    };
  }

  /**
   * Decrypt EncryptedToken to recover GoogleTokens
   * Verifies GCM authentication tag automatically
   */
  async decrypt(encryptedToken: EncryptedToken): Promise<GoogleTokens> {
    try {
      const iv = base64Decode(encryptedToken.iv);
      const ciphertext = base64Decode(encryptedToken.ciphertext);

      // Decrypt (will throw if authentication tag verification fails)
      const payload = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, tagLength: 128 },
        this.encryptionKey,
        ciphertext
      );

      const json = new TextDecoder().decode(payload);
      return JSON.parse(json) as GoogleTokens;
    } catch (error) {
      throw new Error(
        `Token decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Compute HMAC-SHA256 hash of userId for session validation
   * Returns 64-character hex string
   */
  private async computeUserIdHash(userId: string): Promise<string> {
    const signature = await crypto.subtle.sign(
      'HMAC',
      this.hmacKey,
      new TextEncoder().encode(userId)
    );
    return Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

/**
 * Import encryption key from hex-encoded secret
 * @param keyHex 64-character hex string (32 bytes)
 * @returns CryptoKey for AES-GCM encryption/decryption
 */
export async function importEncryptionKey(keyHex: string): Promise<CryptoKey> {
  const keyBytes = new Uint8Array(
    keyHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );
  return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

/**
 * Import HMAC key from hex-encoded secret
 * @param keyHex 64-character hex string (32 bytes)
 * @returns CryptoKey for HMAC-SHA256
 */
export async function importHmacKey(keyHex: string): Promise<CryptoKey> {
  const keyBytes = new Uint8Array(
    keyHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}
