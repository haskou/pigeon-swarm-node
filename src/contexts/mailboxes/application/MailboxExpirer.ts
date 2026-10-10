import { Mailbox } from '../domain/Mailbox';
import MailboxPolicy from '../domain/MailboxPolicy';
import MailboxRepository from '../domain/repositories/MailboxRepository';
import MailboxCoordinator from './MailboxCoordinator';

/** Retention: expired envelopes go, and a mailbox idle for the window is deleted. */
export default class MailboxExpirer {
  constructor(
    private readonly repository: MailboxRepository,
    private readonly policy: MailboxPolicy,
    private readonly coordinator: MailboxCoordinator,
  ) {}

  private async expireOne(mailbox: Mailbox, now: number): Promise<void> {
    const retention = this.policy.retentionMs();

    if (mailbox.getLastReadAt() + retention <= now) {
      await this.repository.remove(mailbox.getId());

      return;
    }

    const all = await this.repository.listEnvelopes(
      mailbox.getId(),
      0,
      Number.MAX_SAFE_INTEGER,
    );
    const expired = all.filter(
      (envelope) => envelope.storedAt + retention <= now,
    );

    if (expired.length === 0) {
      return;
    }

    mailbox.releaseEnvelopes(
      expired.length,
      expired.reduce((sum, envelope) => sum + envelope.size, 0),
    );
    await this.repository.commitRemoval(mailbox, expired);
  }

  /** One failing mailbox never stops the sweep; failures are reported as a count. */
  public async expire(now: number): Promise<void> {
    const mailboxes = await this.repository.listAll();
    let failed = 0;

    for (const mailbox of mailboxes) {
      try {
        await this.coordinator.run(async (): Promise<void> => {
          const fresh = await this.repository.findById(mailbox.getId());

          if (fresh) {
            await this.expireOne(fresh, now);
          }
        });
      } catch {
        failed += 1;
      }
    }

    if (failed > 0) {
      throw new Error(
        `Mailbox expiration failed for ${failed} of ${mailboxes.length} mailboxes.`,
      );
    }
  }
}
