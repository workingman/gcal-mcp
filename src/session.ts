// Session validation utilities
// Will be implemented in issue #10

import type { EncryptedToken } from './types';

export async function computeKVKey(
  userEmail: string,
  hmacKey: CryptoKey
): Promise<string> {
  // Stub implementation
  throw new Error('Not implemented');
}

export async function validateSession(
  requestingUserId: string,
  encryptedToken: EncryptedToken,
  hmacKey: CryptoKey
): Promise<boolean> {
  // Stub implementation
  throw new Error('Not implemented');
}
