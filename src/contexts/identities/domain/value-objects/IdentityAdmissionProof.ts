import {
  InvalidProofOfWorkError,
  ProofOfWork,
} from '@haskou/pigeon-swarm-crypto';

/**
 * Proof that minting an identity into a set of networks cost work: the crypto
 * library's v2 identity-admission proof of work, a length-prefixed SHA-256
 * preimage over the identity id and the sorted network ids that must start with
 * the required leading zero bits. The proof is bound to the identity key and to
 * the networks it enters, so it cannot be reused for another key or to join a
 * different network. Any node verifies it statelessly. A challenge or nonce the
 * library does not accept never verifies.
 */
export class IdentityAdmissionProof {
  public static readonly DIFFICULTY_BITS = 16;

  public constructor(
    private readonly identityId: string,
    private readonly networkIds: string[],
  ) {}

  private work(): ProofOfWork {
    return ProofOfWork.identityAdmission(this.identityId, this.networkIds);
  }

  /** Reference miner: first nonce that satisfies `difficultyBits` and `accepts`. */
  public mine(
    accepts?: (nonce: string) => boolean,
    difficultyBits: number = IdentityAdmissionProof.DIFFICULTY_BITS,
  ): string {
    return this.work().mintSync(difficultyBits, accepts);
  }

  public isValid(
    nonce: unknown,
    difficultyBits: number = IdentityAdmissionProof.DIFFICULTY_BITS,
  ): boolean {
    try {
      return this.work().verify(nonce, difficultyBits);
    } catch (error) {
      if (error instanceof InvalidProofOfWorkError) {
        return false;
      }

      throw error;
    }
  }
}
