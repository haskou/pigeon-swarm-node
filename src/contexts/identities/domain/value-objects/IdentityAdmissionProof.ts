import { leadingZeroBits } from '@app/contexts/shared/domain/value-objects/LeadingZeroBits';
import { createHash } from 'node:crypto';

/**
 * Hashcash-style proof that minting an identity into a set of networks cost
 * work. SHA-256 over the id, the sorted network ids and the nonce must start
 * with DIFFICULTY_BITS leading zero bits. The proof is bound to the identity key and
 * to the networks it enters, so it cannot be reused for another key or to join
 * a different network. Any node verifies it statelessly.
 */
export class IdentityAdmissionProof {
  private static readonly DOMAIN = 'pigeon-identity-admission:v1';
  public static readonly DIFFICULTY_BITS = 16;
  public static readonly MAX_NONCE_LENGTH = 64;

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

  /** Reference miner: first nonce that satisfies the protocol difficulty. */
  public static mine(
    identityId: string,
    networkIds: string[],
    accepts: (nonce: string) => boolean = () => true,
  ): string {
    const difficultyBits = IdentityAdmissionProof.DIFFICULTY_BITS;
    const prefix = createHash('sha256').update(
      IdentityAdmissionProof.preimage(identityId, networkIds, ''),
    );

    for (let nonce = 0; ; nonce += 1) {
      const candidate = nonce.toString();
      const digest = prefix.copy().update(candidate).digest();

      if (leadingZeroBits(digest) >= difficultyBits && accepts(candidate)) {
        return candidate;
      }
    }
  }

  public static isValid(
    identityId: string,
    networkIds: string[],
    nonce: string | undefined,
    difficultyBits: number = IdentityAdmissionProof.DIFFICULTY_BITS,
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

    return leadingZeroBits(digest) >= difficultyBits;
  }
}
