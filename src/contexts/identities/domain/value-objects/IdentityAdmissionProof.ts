import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { createHash } from 'node:crypto';

/**
 * Hashcash-style proof that minting an identity into a set of networks cost
 * work. SHA-256 over the id, the sorted network ids and the nonce must start
 * with the configured number of zero bits. The proof is bound to the identity key and
 * to the networks it enters, so it cannot be reused for another key or to join
 * a different network. Any node verifies it statelessly.
 */
export class IdentityAdmissionProof {
  private static readonly DOMAIN = 'pigeon-identity-admission:v1';
  public static readonly DEFAULT_DIFFICULTY_BITS = 20;
  public static readonly MAX_DIFFICULTY_BITS = 32;
  public static readonly MAX_NONCE_LENGTH = 64;

  private static leadingZeroBits(digest: Buffer): number {
    let bits = 0;

    for (const byte of digest) {
      if (byte === 0) {
        bits += 8;
        continue;
      }

      return bits + Math.clz32(byte) - 24;
    }

    return bits;
  }

  public static preimage(
    identityId: string,
    networkIds: string[],
    nonce: string,
  ): string {
    return [
      IdentityAdmissionProof.DOMAIN,
      identityId,
      [...networkIds].sort().join(','),
      nonce,
    ].join(':');
  }

  public static difficultyBits(environment = pigeonEnvironment()): number {
    const configured = environment.IDENTITY_ADMISSION_DIFFICULTY_BITS;

    return Number.isInteger(configured) &&
      configured > 0 &&
      configured <= IdentityAdmissionProof.MAX_DIFFICULTY_BITS
      ? configured
      : IdentityAdmissionProof.DEFAULT_DIFFICULTY_BITS;
  }

  public static isValid(
    identityId: string,
    networkIds: string[],
    nonce: string | undefined,
    difficultyBits: number = IdentityAdmissionProof.difficultyBits(),
  ): boolean {
    if (
      typeof nonce !== 'string' ||
      nonce.length === 0 ||
      nonce.length > IdentityAdmissionProof.MAX_NONCE_LENGTH
    ) {
      return false;
    }

    const digest = createHash('sha256')
      .update(IdentityAdmissionProof.preimage(identityId, networkIds, nonce))
      .digest();

    return IdentityAdmissionProof.leadingZeroBits(digest) >= difficultyBits;
  }
}
