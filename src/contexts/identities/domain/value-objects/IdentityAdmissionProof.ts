import { ProofOfWork } from '@app/contexts/shared/domain/proof-of-work/ProofOfWork';

/**
 * Hashcash-style proof that minting an identity into a set of networks cost
 * work. SHA-256 over the id, the sorted network ids and the nonce must start
 * with DIFFICULTY_BITS leading zero bits. The proof is bound to the identity key
 * and to the networks it enters, so it cannot be reused for another key or to
 * join a different network. Any node verifies it statelessly.
 */
export class IdentityAdmissionProof {
  private static readonly DOMAIN = 'pigeon-identity-admission:v1';
  public static readonly DIFFICULTY_BITS = 16;

  private readonly work: ProofOfWork;

  public constructor(identityId: string, networkIds: string[]) {
    this.work = new ProofOfWork(IdentityAdmissionProof.DOMAIN, [
      identityId,
      [...networkIds].sort().join(','),
    ]);
  }

  /** Reference miner: first nonce that satisfies the protocol difficulty. */
  public mine(accepts?: (nonce: string) => boolean): string {
    return this.work.mine(IdentityAdmissionProof.DIFFICULTY_BITS, accepts);
  }

  public isValid(
    nonce: string | undefined,
    difficultyBits: number = IdentityAdmissionProof.DIFFICULTY_BITS,
  ): boolean {
    return (
      typeof nonce === 'string' && this.work.isValid(nonce, difficultyBits)
    );
  }
}
