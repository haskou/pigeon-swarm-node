import { BaseError } from '@haskou/ddd-kernel/domain';

export class MailboxReaderLimitReachedError extends BaseError {
  constructor() {
    super('Mailbox has reached its reader limit.');
  }
}
