import { Duration } from '@haskou/value-objects';

/** Operator-configured mailbox bounds, bound by composition. */
export class MailboxLimits {
  constructor(
    public readonly maxAppendsPerMinute: number,
    public readonly maxBytesPerMailbox: number,
    public readonly maxEnvelopesPerMailbox: number,
    public readonly maxMailboxes: number,
    public readonly maxReaders: number,
    public readonly retention: Duration,
  ) {}
}
