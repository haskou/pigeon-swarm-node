import { MailboxConflictError } from '../domain/errors/MailboxConflictError';
import { MailboxCreationProofInvalidError } from '../domain/errors/MailboxCreationProofInvalidError';
import { MailboxLimitReachedError } from '../domain/errors/MailboxLimitReachedError';
import { Mailbox } from '../domain/Mailbox';
import { MailboxCreationDifficulty } from '../domain/MailboxCreationDifficulty';
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
   * Frees `needed` slots by removing the least recently read mailboxes that
   * are empty and idle. All or nothing: with too few such mailboxes nothing
   * is removed and the creation is refused.
   */
  private async evictIdleEmpty(needed: number, now: number): Promise<void> {
    const candidates = (await this.repository.listAll())
      .filter((mailbox) =>
        mailbox.isIdleAndEmpty(now, MailboxPolicy.EVICTION_IDLE_MS),
      )
      .sort((a, b) => a.getLastReadAt() - b.getLastReadAt());

    if (candidates.length < needed) {
      throw new MailboxLimitReachedError();
    }

    for (const mailbox of candidates.slice(0, needed)) {
      await this.repository.remove(mailbox.getId());
    }
  }

  /**
   * Idempotent for identical hashes; returns whether a queue was created.
   * The proof of work is checked before any lookup, so an unproven request
   * learns nothing about which mailbox ids exist. The required difficulty
   * follows how full the node is, and a short proof is told what it needs.
   */
  public async create(
    mailboxId: string,
    postTokenHash: string,
    readTokenHash: string,
    creationNonce: string,
  ): Promise<boolean> {
    const requiredBits = MailboxCreationDifficulty.bitsFor(
      await this.repository.count(),
      this.policy.maxMailboxes(),
    );

    if (
      !MailboxCreationProof.isValid(
        mailboxId,
        postTokenHash,
        readTokenHash,
        creationNonce,
        requiredBits,
      )
    ) {
      throw new MailboxCreationProofInvalidError(requiredBits);
    }

    return this.coordinator.run(async (): Promise<boolean> => {
      const existing = await this.repository.findById(mailboxId);

      if (existing) {
        if (!existing.hasHashes(postTokenHash, readTokenHash)) {
          throw new MailboxConflictError();
        }

        return false;
      }

      const now = Date.now();
      const count = await this.repository.count();
      const max = this.policy.maxMailboxes();

      if (count >= max) {
        await this.evictIdleEmpty(count - max + 1, now);
      }

      await this.repository.create(
        Mailbox.create({
          appendTokens: this.policy.maxAppendsPerMinute(),
          id: mailboxId,
          now,
          postTokenHash,
          readTokenHash,
        }),
      );

      return true;
    });
  }
}
