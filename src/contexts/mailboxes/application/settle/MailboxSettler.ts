import { Mailbox } from '../../domain/Mailbox';
import { MailboxEnvelope } from '../../domain/MailboxEnvelope';
import MailboxRepository from '../../domain/repositories/MailboxRepository';

/**
 * Finds the envelopes every reader has acknowledged and releases their
 * capacity. The caller persists the removal with commitRemoval, in the same
 * batch as the mailbox counters.
 */
export default class MailboxSettler {
  constructor(private readonly repository: MailboxRepository) {}

  public async settle(mailbox: Mailbox): Promise<MailboxEnvelope[]> {
    const settled = mailbox.settledCursor();
    const all = await this.repository.listEnvelopes(
      mailbox.getId(),
      0,
      Number.MAX_SAFE_INTEGER,
    );
    const removed = all.filter((envelope) => envelope.cursor <= settled);

    mailbox.releaseEnvelopes(removed);

    return removed;
  }
}
