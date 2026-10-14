import { Timestamp } from '@haskou/value-objects';

import { MailboxCreationProofInvalidError } from '../../domain/errors/MailboxCreationProofInvalidError';
import { Mailbox } from '../../domain/Mailbox';
import { MailboxCreationDifficulty } from '../../domain/MailboxCreationDifficulty';
import { MailboxCreationProof } from '../../domain/MailboxCreationProof';
import MailboxPolicy from '../../domain/MailboxPolicy';
import MailboxRepository from '../../domain/repositories/MailboxRepository';
import MailboxCoordinator from '../coordinate/MailboxCoordinator';
import { MailboxCreateMessage } from './messages/MailboxCreateMessage';

export default class MailboxCreator {
  constructor(
    private readonly repository: MailboxRepository,
    private readonly policy: MailboxPolicy,
    private readonly coordinator: MailboxCoordinator,
  ) {}

  /**
   * Frees `needed` slots by removing the least recently read mailboxes that
   * are empty and idle. All or nothing: with too few such mailboxes nothing
   * is removed and the creation is refused.
   */
  private async evictIdleEmpty(needed: number, now: Timestamp): Promise<void> {
    const victims = Mailbox.selectEvictions(
      await this.repository.listAll(),
      now,
      needed,
    );

    for (const mailbox of victims) {
      await this.repository.remove(mailbox.getId());
    }
  }

  /**
   * Idempotent for identical hashes; returns whether a queue was created.
   * The proof of work is checked before any lookup, so an unproven request
   * learns nothing about which mailbox ids exist. The required difficulty
   * follows how full the node is, and a short proof is told what it needs.
   */
  public async create(message: MailboxCreateMessage): Promise<boolean> {
    const requiredBits = MailboxCreationDifficulty.bitsFor(
      await this.repository.count(),
      this.policy.maxMailboxes(),
    );

    const proof = new MailboxCreationProof(
      message.mailboxId.valueOf(),
      message.postTokenHash.valueOf(),
      message.readTokenHash.valueOf(),
    );

    if (!proof.isValid(message.creationNonce.valueOf(), requiredBits)) {
      throw new MailboxCreationProofInvalidError(requiredBits);
    }

    return this.coordinator.run(async (): Promise<boolean> => {
      if (await this.repository.hasById(message.mailboxId)) {
        const existing = await this.repository.requireById(message.mailboxId);

        existing.requireHashes(message.postTokenHash, message.readTokenHash);

        return false;
      }

      const now = Timestamp.now();
      const count = await this.repository.count();
      const max = this.policy.maxMailboxes();

      if (count >= max) {
        await this.evictIdleEmpty(count - max + 1, now);
      }

      const firstCursor = (await this.repository.highestRetiredCursor()).next();

      await this.repository.create(
        Mailbox.create({
          appendTokens: this.policy.maxAppendsPerMinute(),
          firstCursor,
          id: message.mailboxId,
          now,
          postTokenHash: message.postTokenHash,
          readTokenHash: message.readTokenHash,
        }),
      );

      return true;
    });
  }
}
