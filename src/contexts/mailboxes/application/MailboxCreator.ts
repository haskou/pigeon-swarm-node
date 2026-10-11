import { MailboxConflictError } from '../domain/errors/MailboxConflictError';
import { MailboxCreationProofInvalidError } from '../domain/errors/MailboxCreationProofInvalidError';
import { MailboxLimitReachedError } from '../domain/errors/MailboxLimitReachedError';
import { Mailbox } from '../domain/Mailbox';
import { MailboxCreationProof } from '../domain/MailboxCreationProof';
import MailboxPolicy from '../domain/MailboxPolicy';
import MailboxRepository from '../domain/repositories/MailboxRepository';
import MailboxCoordinator from './MailboxCoordinator';

export default class MailboxCreator {
  constructor(
    private readonly repository: MailboxRepository,
    private readonly policy: MailboxPolicy,
    private readonly coordinator: MailboxCoordinator,
  ) {}

  /**
   * Idempotent for identical hashes; returns whether a queue was created.
   * The proof of work is checked before any lookup, so an unproven request
   * learns nothing about which mailbox ids exist.
   */
  public async create(
    mailboxId: string,
    postTokenHash: string,
    readTokenHash: string,
    creationNonce: string,
  ): Promise<boolean> {
    if (
      !MailboxCreationProof.isValid(
        mailboxId,
        postTokenHash,
        readTokenHash,
        creationNonce,
      )
    ) {
      throw new MailboxCreationProofInvalidError();
    }

    return this.coordinator.run(async (): Promise<boolean> => {
      const existing = await this.repository.findById(mailboxId);

      if (existing) {
        if (!existing.hasHashes(postTokenHash, readTokenHash)) {
          throw new MailboxConflictError();
        }

        return false;
      }

      if ((await this.repository.count()) >= this.policy.maxMailboxes()) {
        throw new MailboxLimitReachedError();
      }

      await this.repository.create(
        Mailbox.create({
          id: mailboxId,
          now: Date.now(),
          postTokenHash,
          readTokenHash,
          appendTokens: this.policy.maxAppendsPerMinute(),
        }),
      );

      return true;
    });
  }
}
