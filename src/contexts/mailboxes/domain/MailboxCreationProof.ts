import { ProofOfWork } from '@app/contexts/shared/domain/proof-of-work/ProofOfWork';

/**
 * Hashcash-style proof that creating a mailbox cost work. SHA-256 over the
 * mailbox id, both capability hashes and the nonce must start with the
 * difficulty bits the caller requires (see MailboxCreationDifficulty).
 * Binding the id and both hashes means a proof solved for one mailbox cannot
 * be replayed for another. Any node verifies it statelessly, before any
 * storage lookup.
 */
export class MailboxCreationProof {
  private static readonly DOMAIN = 'pigeon-mailbox-creation:v1';

  private readonly work: ProofOfWork;

  public constructor(
    mailboxId: string,
    postTokenHash: string,
    readTokenHash: string,
  ) {
    this.work = new ProofOfWork(MailboxCreationProof.DOMAIN, [
      mailboxId,
      postTokenHash,
      readTokenHash,
    ]);
  }

  /** Reference miner: first nonce with difficultyBits leading zero bits. */
  public mine(difficultyBits: number): string {
    return this.work.mine(difficultyBits);
  }

  public isValid(nonce: string, difficultyBits: number): boolean {
    return this.work.isValid(nonce, difficultyBits);
  }
}
