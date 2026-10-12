import { Timestamp } from '@haskou/value-objects';

import { Mailbox } from '../domain/Mailbox';
import MailboxPolicy from '../domain/MailboxPolicy';
import MailboxRepository from '../domain/repositories/MailboxRepository';
import MailboxCoordinator from './MailboxCoordinator';
import MailboxEnvelopeNotifier from './MailboxEnvelopeNotifier';

/** Retention: expired envelopes go, and a mailbox idle for the window is deleted. */
export default class MailboxExpirer {
  constructor(
    private readonly repository: MailboxRepository,
    private readonly policy: MailboxPolicy,
    private readonly coordinator: MailboxCoordinator,
    private readonly notifier: MailboxEnvelopeNotifier,
  ) {}

  private async expireOne(mailbox: Mailbox, now: Timestamp): Promise<void> {
    if (mailbox.isExpired(now, this.policy)) {
      await this.repository.remove(mailbox.getId());
      this.notifier.mailboxRemoved(mailbox.getId());

      return;
    }

    const all = await this.repository.listEnvelopes(
      mailbox.getId(),
      0,
      Number.MAX_SAFE_INTEGER,
    );
    const expired = this.policy.expiredEnvelopes(all, now);

    if (expired.length === 0) {
      return;
    }

    mailbox.releaseEnvelopes(expired);
    await this.repository.commitRemoval(mailbox, expired);
  }

  /** One failing mailbox never stops the sweep; failures are reported as a count. */
  public async expire(now: Timestamp): Promise<void> {
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
