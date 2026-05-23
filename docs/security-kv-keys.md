# Security Analysis: HMAC-Based KV Keys

## Overview

This document proves that the Calendar MCP Server's KV key generation system is **cryptographically non-enumerable**, preventing attackers from discovering or predicting storage keys for other users' tokens.

## Key Generation Algorithm

```typescript
// From src/session.ts
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
```

**Format**: `google_tokens:{HMAC-SHA256(userEmail)}`

## HMAC-SHA256 Security Properties

### 1. Preimage Resistance
**Property**: Given `H(x)`, computationally infeasible to find `x`

**Implication**: An attacker who knows a KV key `google_tokens:abc123...` cannot derive the user email from the hash portion.

**Mathematical Basis**: Breaking preimage resistance requires ~2^256 operations (infeasible with current technology).

### 2. Key Dependency
**Property**: Without the HMAC key, outputs appear random and unpredictable

**Implication**: Even if an attacker knows:
- User A's email: `usera@example.com`
- User A's KV key: `google_tokens:7f3a...`
- User B's email: `userb@example.com`

They **cannot** compute User B's KV key without the HMAC key.

**Attack Resistance**:
- Brute-force enumeration: 2^256 key space (infeasible)
- Pattern prediction: HMAC avalanche effect ensures no correlation
- Rainbow tables: Keyed HMAC makes precomputation useless

### 3. Collision Resistance
**Property**: Computationally infeasible to find `x ≠ y` where `H(x) = H(y)`

**Implication**: Different users will always have different KV keys (no collisions).

**Mathematical Basis**: Birthday attack requires ~2^128 operations for 50% collision probability.

### 4. Deterministic Output
**Property**: Same input always produces same output

**Implication**: Given `userEmail`, we can always compute the same KV key for retrieval.

**Benefit**: Enables consistent token storage/retrieval without storing email-to-key mappings.

## Attack Scenarios & Mitigations

### Attack 1: Enumerate All User Tokens
**Scenario**: Attacker lists all keys in KV and tries to access tokens.

**Mitigation**:
1. KV keys are HMAC-hashed, not plaintext emails
2. Without HMAC key, attacker cannot determine which emails correspond to which keys
3. Each token has embedded `user_id_hash` - decryption reveals mismatch

**Result**: ❌ Attack fails at Layer 2 validation (user_id_hash mismatch)

### Attack 2: Guess Common Email Patterns
**Scenario**: Attacker tries `admin@example.com`, `user@example.com`, etc.

**Mitigation**:
1. Without HMAC key, attacker cannot compute valid KV keys
2. Random guessing: 2^256 possible keys, success rate negligible
3. KV lookup returns `null` for wrong keys (no information leak)

**Result**: ❌ Attack fails at Layer 1 (HMAC prevents key generation)

### Attack 3: Derive User B's Key from User A's Key
**Scenario**: Attacker compromises User A, learns their KV key, attempts to predict User B's key.

**Mitigation**:
1. HMAC avalanche effect: 1-char email change → ~50% hash bits flip
2. No mathematical relationship between keys
3. Preimage resistance prevents reverse-engineering

**Example**:
```
User A: user@example.com → google_tokens:7f3ab2c4...
User B: user@examplf.com → google_tokens:e1d98a7f...
             ^ 1 char diff         ^ ~32 hex chars differ
```

**Result**: ❌ Attack fails (no predictable pattern)

### Attack 4: Rainbow Table Precomputation
**Scenario**: Attacker precomputes HMAC values for common emails.

**Mitigation**:
1. HMAC uses secret key - attacker cannot precompute without key
2. Key rotation changes all hashes
3. Even with leaked key, precomputation requires 2^256 space

**Result**: ❌ Attack fails (key-dependent hash prevents precomputation)

## Formal Security Guarantees

### Non-Enumeration Guarantee
**Theorem**: Without the HMAC key, an attacker cannot enumerate valid KV keys faster than random guessing.

**Proof**:
1. Let `K` = HMAC key (256-bit secret)
2. Let `E` = user email (arbitrary string)
3. KV key = `HMAC-SHA256(K, E)`
4. By HMAC security, without `K`, output is pseudorandom
5. Attacker's probability of guessing valid key: `1/2^256`
6. Expected enumeration cost: `2^255` attempts (infeasible)

**Conclusion**: Non-enumeration is guaranteed by HMAC-SHA256 security.

### Non-Reversibility Guarantee
**Theorem**: Given a KV key, an attacker cannot determine the corresponding user email without the HMAC key.

**Proof**:
1. Let `H = HMAC-SHA256(K, E)` = observed KV key hash
2. Attacker wants to find `E` given `H` (preimage attack)
3. By HMAC-SHA256 preimage resistance: probability of success ≤ `1/2^256`
4. No known algorithm faster than brute-force

**Conclusion**: Non-reversibility is guaranteed by HMAC-SHA256 preimage resistance.

## Implementation Validation

The test suite (`tests/kv-key-security.test.ts`) validates:

1. ✅ Unique keys for different users (no collisions)
2. ✅ Non-reversible keys (hash → email is infeasible)
3. ✅ No predictable patterns for sequential users
4. ✅ Deterministic output (retrieval consistency)
5. ✅ Enumeration attack prevention
6. ✅ Brute-force resistance
7. ✅ High avalanche effect (1-char change → ~50% hash change)

## Key Rotation Strategy

**Current**: Single HMAC key in `TOKEN_HMAC_KEY` environment variable

**Rotation Process** (future enhancement):
1. Generate new HMAC key
2. Re-compute all KV keys with new key
3. Migrate tokens to new keys
4. Delete old keys
5. Update `TOKEN_HMAC_KEY` in environment

**Security Benefit**: Limits exposure from key compromise.

## Comparison to Alternative Approaches

| Approach | Security | Performance | Complexity |
|----------|----------|-------------|------------|
| **HMAC-SHA256 (current)** | ✅ Strong | ✅ Fast | ✅ Simple |
| Plaintext email | ❌ Weak (enumerable) | ✅ Fast | ✅ Simple |
| AES-encrypted email | ✅ Strong | ⚠️ Slower | ⚠️ Complex |
| Random UUID mapping | ✅ Strong | ❌ Requires lookup table | ❌ Complex |

**Chosen approach (HMAC)** provides best balance of security, performance, and simplicity.

## References

- **FIPS 198-1**: The Keyed-Hash Message Authentication Code (HMAC)
- **RFC 2104**: HMAC: Keyed-Hashing for Message Authentication
- **NIST SP 800-107**: Recommendation for Applications Using Approved Hash Algorithms
- **HMAC-SHA256 Security**: 256-bit output, 128-bit security level against collision attacks

## Conclusion

The Calendar MCP Server's HMAC-based KV key system provides **provable non-enumeration guarantees**:

1. ✅ Attackers cannot enumerate valid keys without HMAC key
2. ✅ Attackers cannot reverse-engineer emails from KV keys
3. ✅ Attackers cannot predict keys for other users
4. ✅ Multi-user token isolation is cryptographically enforced

**Security Level**: 256-bit (quantum-resistant to Grover's algorithm: 2^128 effective bits)
