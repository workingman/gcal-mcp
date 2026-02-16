// Token encryption/decryption (TokenManager class)
// Will be implemented in issue #9

import type { EncryptedToken, GoogleTokens } from './types';

export class TokenManager {
  constructor(
    private encryptionKey: CryptoKey,
    private hmacKey: CryptoKey
  ) {}

  async encrypt(tokens: GoogleTokens, userId: string): Promise<EncryptedToken> {
    // Stub implementation
    throw new Error('Not implemented');
  }

  async decrypt(encryptedToken: EncryptedToken): Promise<GoogleTokens> {
    // Stub implementation
    throw new Error('Not implemented');
  }
}
