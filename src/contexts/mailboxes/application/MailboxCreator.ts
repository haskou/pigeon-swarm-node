import { MailboxConflictError } from '../domain/errors/MailboxConflictError';
import { MailboxLimitReachedError } from '../domain/errors/MailboxLimitReachedError';
import { Mailbox } from '../domain/Mailbox';
import MailboxPolicy from '../domain/MailboxPolicy';
import MailboxRepository from '../domain/repositories/MailboxRepository';
import MailboxCoordinator from './MailboxCoordinator';

export default class MailboxCreator {
  constructor(
    private readonly repository: MailboxRepository,
    private readonly policy: MailboxPolicy,
    private readonly coordinator: MailboxCoordinator,
  ) {}

  /** Idempotent for identical hashes; returns whether a queue was created. */
  public create(
    mailboxId: string,
    postTokenHash: string,
    readTokenHash: string,
  ): Promise<boolean> {
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
        }),
      );

      return true;
    });
  }
}
