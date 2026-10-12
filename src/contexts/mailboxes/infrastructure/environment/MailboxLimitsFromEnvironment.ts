import { MailboxLimits } from '@app/contexts/mailboxes/domain/MailboxLimits';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';

/** Reads the operator-configured mailbox bounds from the process environment. */
export class MailboxLimitsFromEnvironment {
  public static load(): MailboxLimits {
    const environment = pigeonEnvironment();

    return new MailboxLimits(
      environment.MAILBOX_APPEND_RATE_PER_MINUTE,
      environment.MAILBOX_MAX_BYTES,
      environment.MAILBOX_MAX_ENVELOPES,
      environment.MAILBOX_MAX_COUNT,
      environment.MAILBOX_MAX_READERS,
      environment.MAILBOX_RETENTION_MS,
    );
  }
}
