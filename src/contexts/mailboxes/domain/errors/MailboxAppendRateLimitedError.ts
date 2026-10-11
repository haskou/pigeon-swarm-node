import { BaseError } from '@haskou/ddd-kernel/domain';

export class MailboxAppendRateLimitedError extends BaseError {
  constructor() {
    super('Mailbox is receiving envelopes too quickly. Try again shortly.');
  }
}
