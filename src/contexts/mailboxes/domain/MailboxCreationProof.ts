import {
  InvalidProofOfWorkError,
  ProofOfWork,
} from '@haskou/pigeon-swarm-crypto';

/**
 * Proof that creating a mailbox cost work: the crypto library's v2
 * mailbox-creation proof of work, a length-prefixed SHA-256 preimage over the
 * mailbox id and both capability hashes that must start with the difficulty
 * bits the caller requires (see MailboxCreationDifficulty). Binding the id and
 * both hashes means a proof solved for one mailbox cannot be replayed for
 * another. Any node verifies it statelessly, before any storage lookup. A
 * challenge or nonce the library does not accept never verifies.
 */
export class MailboxCreationProof {
  public constructor(
    private readonly mailboxId: string,
    private readonly postTokenHash: string,
    private readonly readTokenHash: string,
  ) {}

  private work(): ProofOfWork {
    return ProofOfWork.mailboxCreation(
      this.mailboxId,
      this.postTokenHash,
      this.readTokenHash,
    );
  }

  /** Reference miner: first nonce with difficultyBits leading zero bits. */
  public mine(difficultyBits: number): string {
    return this.work().mintSync(difficultyBits);
  }

  public isValid(nonce: unknown, difficultyBits: number): boolean {
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
